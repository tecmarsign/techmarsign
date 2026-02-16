import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Reuse JWT verification from user-data
let cachedJwks: any = null;
let jwksCacheTime = 0;
const JWKS_CACHE_TTL = 3600000;

async function fetchJwks(issuer: string): Promise<any> {
  const now = Date.now();
  if (cachedJwks && now - jwksCacheTime < JWKS_CACHE_TTL) return cachedJwks;
  const res = await fetch(`${issuer}/.well-known/jwks.json`);
  if (!res.ok) throw new Error("Failed to fetch JWKS");
  cachedJwks = await res.json();
  jwksCacheTime = now;
  return cachedJwks;
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function verifyClerkJWT(token: string): Promise<string | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const headerJson = new TextDecoder().decode(base64UrlDecode(parts[0]));
    const payloadJson = new TextDecoder().decode(base64UrlDecode(parts[1]));
    const header = JSON.parse(headerJson);
    const payload = JSON.parse(payloadJson);
    if (header.alg !== "RS256") return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    if (payload.nbf && payload.nbf > now + 60) return null;
    const issuer = payload.iss;
    if (!issuer) return null;
    const jwks = await fetchJwks(issuer);
    const key = jwks.keys?.find((k: any) => k.kid === header.kid && k.kty === "RSA");
    if (!key) return null;
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      { kty: key.kty, n: key.n, e: key.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signatureBytes = base64UrlDecode(parts[2]);
    const dataBytes = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const isValid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signatureBytes, dataBytes);
    if (!isValid) return null;
    return payload.sub || null;
  } catch {
    return null;
  }
}

function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// Allowed tables for admin CRUD
const ALLOWED_TABLES = [
  "courses", "course_phases", "tutor_courses", "enrollments",
  "user_roles", "profiles", "enrollment_attempts", "role_change_audit",
  "lessons", "assignments", "assignment_submissions", "lesson_materials",
  "lesson_progress"
] as const;
type AllowedTable = typeof ALLOWED_TABLES[number];

function isAllowedTable(t: string): t is AllowedTable {
  return (ALLOWED_TABLES as readonly string[]).includes(t);
}

// Sanitize: only allow known column names (alphanumeric + underscore)
function isValidColumn(col: string): boolean {
  return /^[a-z_][a-z0-9_]*$/i.test(col) && col.length <= 64;
}

function sanitizeData(data: Record<string, any>): Record<string, any> | null {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!isValidColumn(key)) return null;
    clean[key] = value;
  }
  return clean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const userId = await verifyClerkJWT(token);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, table, data: rowData, filters, select, order } = body;

    if (!table || !isAllowedTable(table)) {
      return new Response(JSON.stringify({ error: "Invalid table" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: any;

    switch (action) {
      case "select": {
        let query = supabase.from(table).select(select || "*");
        if (filters) {
          for (const f of filters) {
            if (!isValidColumn(f.column)) {
              return new Response(JSON.stringify({ error: "Invalid filter column" }), {
                status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            switch (f.op) {
              case "eq": query = query.eq(f.column, f.value); break;
              case "in": query = query.in(f.column, f.value); break;
              case "neq": query = query.neq(f.column, f.value); break;
              case "gt": query = query.gt(f.column, f.value); break;
              case "lt": query = query.lt(f.column, f.value); break;
              default:
                return new Response(JSON.stringify({ error: "Invalid filter op" }), {
                  status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
          }
        }
        if (order) {
          if (!isValidColumn(order.column)) {
            return new Response(JSON.stringify({ error: "Invalid order column" }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          query = query.order(order.column, { ascending: order.ascending ?? true });
        }
        result = await query;
        break;
      }

      case "insert": {
        if (!rowData) {
          return new Response(JSON.stringify({ error: "Data required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const cleanData = sanitizeData(rowData);
        if (!cleanData) {
          return new Response(JSON.stringify({ error: "Invalid data columns" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = await supabase.from(table).insert(cleanData).select();
        break;
      }

      case "update": {
        if (!rowData || !filters || filters.length === 0) {
          return new Response(JSON.stringify({ error: "Data and filters required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const cleanUpdate = sanitizeData(rowData);
        if (!cleanUpdate) {
          return new Response(JSON.stringify({ error: "Invalid data columns" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        let updateQuery = supabase.from(table).update(cleanUpdate);
        for (const f of filters) {
          if (!isValidColumn(f.column)) {
            return new Response(JSON.stringify({ error: "Invalid filter column" }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (f.op === "eq") updateQuery = updateQuery.eq(f.column, f.value);
        }
        result = await updateQuery.select();
        break;
      }

      case "delete": {
        if (!filters || filters.length === 0) {
          return new Response(JSON.stringify({ error: "Filters required for delete" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        let deleteQuery = supabase.from(table).delete();
        for (const f of filters) {
          if (!isValidColumn(f.column)) {
            return new Response(JSON.stringify({ error: "Invalid filter column" }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (f.op === "eq") deleteQuery = deleteQuery.eq(f.column, f.value);
        }
        result = await deleteQuery;
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    if (result.error) {
      console.error("Admin CRUD error:", result.error);
      return new Response(JSON.stringify({ error: "Database operation failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ data: result.data }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Admin CRUD error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
