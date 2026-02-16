// Admin API helper - routes all admin CRUD through the admin-crud edge function
// which verifies Clerk JWT and admin role before using service role key.

interface Filter {
  column: string;
  op: "eq" | "in" | "neq" | "gt" | "lt";
  value: any;
}

interface OrderBy {
  column: string;
  ascending?: boolean;
}

interface AdminRequestBase {
  table: string;
}

interface SelectRequest extends AdminRequestBase {
  action: "select";
  select?: string;
  filters?: Filter[];
  order?: OrderBy;
}

interface InsertRequest extends AdminRequestBase {
  action: "insert";
  data: Record<string, any>;
}

interface UpdateRequest extends AdminRequestBase {
  action: "update";
  data: Record<string, any>;
  filters: Filter[];
}

interface DeleteRequest extends AdminRequestBase {
  action: "delete";
  filters: Filter[];
}

type AdminRequest = SelectRequest | InsertRequest | UpdateRequest | DeleteRequest;

interface AdminResponse<T = any> {
  data: T | null;
  error: string | null;
}

export async function adminApi<T = any>(
  request: AdminRequest,
  getToken: () => Promise<string | null>
): Promise<AdminResponse<T>> {
  const token = await getToken();
  if (!token) {
    return { data: null, error: "Not authenticated" };
  }

  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-crud`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return { data: null, error: result.error || "Request failed" };
    }

    return { data: result.data, error: null };
  } catch (err) {
    return { data: null, error: "Network error" };
  }
}
