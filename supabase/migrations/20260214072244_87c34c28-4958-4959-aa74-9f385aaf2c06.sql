
-- Drop ALL storage policies
DROP POLICY IF EXISTS "Students can upload submission files" ON storage.objects;
DROP POLICY IF EXISTS "Students can view own submission files" ON storage.objects;
DROP POLICY IF EXISTS "Tutors can view submission files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all assignment files" ON storage.objects;
DROP POLICY IF EXISTS "Tutors can upload lesson materials" ON storage.objects;
DROP POLICY IF EXISTS "Tutors can delete their lesson materials" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all lesson materials files" ON storage.objects;
DROP POLICY IF EXISTS "Enrolled students can view lesson materials files" ON storage.objects;

-- Drop FK constraints
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.tutor_courses DROP CONSTRAINT IF EXISTS tutor_courses_tutor_id_fkey;
ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS enrollments_student_id_fkey;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

-- Drop ALL public RLS policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Students can view own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Admins can manage all enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Tutors can view enrollments for their courses" ON public.enrollments;
DROP POLICY IF EXISTS "Admins can view enrollment attempts" ON public.enrollment_attempts;
DROP POLICY IF EXISTS "Students can view own progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Students can update own progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Students can mark lessons complete" ON public.lesson_progress;
DROP POLICY IF EXISTS "Admins can view all progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Tutors can view student progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Students can view own submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Students can submit assignments" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Admins can manage all submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Tutors can grade submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Tutors can view submissions for their courses" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Tutors can view their assigned courses" ON public.tutor_courses;
DROP POLICY IF EXISTS "Admins can manage tutor assignments" ON public.tutor_courses;
DROP POLICY IF EXISTS "Tutors can manage lessons for their courses" ON public.lessons;
DROP POLICY IF EXISTS "Admins can manage all lessons" ON public.lessons;
DROP POLICY IF EXISTS "Tutors can manage assignments for their courses" ON public.assignments;
DROP POLICY IF EXISTS "Admins can manage all assignments" ON public.assignments;
DROP POLICY IF EXISTS "Tutors can manage materials for their courses" ON public.lesson_materials;
DROP POLICY IF EXISTS "Admins can manage all materials" ON public.lesson_materials;
DROP POLICY IF EXISTS "Enrolled students can view lesson materials" ON public.lesson_materials;
DROP POLICY IF EXISTS "Admins can manage courses" ON public.courses;
DROP POLICY IF EXISTS "Admins can manage course phases" ON public.course_phases;
DROP POLICY IF EXISTS "Admins can view role change audit" ON public.role_change_audit;

-- Alter columns from uuid to text
ALTER TABLE public.profiles ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.user_roles ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.enrollments ALTER COLUMN student_id TYPE text USING student_id::text;
ALTER TABLE public.enrollment_attempts ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.lesson_progress ALTER COLUMN student_id TYPE text USING student_id::text;
ALTER TABLE public.assignment_submissions ALTER COLUMN student_id TYPE text USING student_id::text;
ALTER TABLE public.tutor_courses ALTER COLUMN tutor_id TYPE text USING tutor_id::text;
ALTER TABLE public.role_change_audit ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.role_change_audit ALTER COLUMN changed_by TYPE text USING changed_by::text;

-- Re-add unique constraint
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

-- UPDATE FUNCTIONS FIRST (before policies that use them)
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);
DROP FUNCTION IF EXISTS public.has_role(text, app_role);

CREATE FUNCTION public.has_role(_user_id text, _role app_role)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.has_role(_user_id::text, _role) $$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id text)
 RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id::text, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id::text, 'student');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_role_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.role_change_audit (user_id, old_role, new_role, changed_by)
  VALUES (NEW.user_id, OLD.role, NEW.role, auth.uid()::text);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_activate_enrollment(_enrollment_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid()::text, 'admin'::app_role) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  UPDATE enrollments SET status = 'active' WHERE id = _enrollment_id;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_enrollment(_course_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _enrollment_id UUID; _course_price NUMERIC; _existing UUID; _attempts INTEGER; _uid text;
BEGIN
  _uid := auth.uid()::text;
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT COUNT(*) INTO _attempts FROM public.enrollment_attempts WHERE user_id = _uid AND attempted_at > now() - INTERVAL '1 hour';
  IF _attempts >= 10 THEN
    INSERT INTO public.enrollment_attempts (user_id, course_id, success) VALUES (_uid, _course_id, false);
    RAISE EXCEPTION 'Too many enrollment attempts';
  END IF;
  SELECT price INTO _course_price FROM public.courses WHERE id = _course_id AND is_active = true;
  IF NOT FOUND THEN
    INSERT INTO public.enrollment_attempts (user_id, course_id, success) VALUES (_uid, _course_id, false);
    RAISE EXCEPTION 'Course not found or not active';
  END IF;
  SELECT id INTO _existing FROM public.enrollments WHERE student_id = _uid AND course_id = _course_id;
  IF _existing IS NOT NULL THEN
    INSERT INTO public.enrollment_attempts (user_id, course_id, success) VALUES (_uid, _course_id, false);
    RAISE EXCEPTION 'Already enrolled';
  END IF;
  IF _course_price IS NOT NULL AND _course_price > 0 THEN
    INSERT INTO public.enrollments (student_id, course_id, status, current_phase, progress) VALUES (_uid, _course_id, 'pending_payment', 1, 0) RETURNING id INTO _enrollment_id;
  ELSE
    INSERT INTO public.enrollments (student_id, course_id, status, current_phase, progress) VALUES (_uid, _course_id, 'active', 1, 0) RETURNING id INTO _enrollment_id;
  END IF;
  INSERT INTO public.enrollment_attempts (user_id, course_id, success) VALUES (_uid, _course_id, true);
  RETURN _enrollment_id;
END;
$function$;

-- NOW recreate policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid()::text = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid()::text, 'admin'::app_role));
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (has_role(auth.uid()::text, 'admin'::app_role));
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL USING (has_role(auth.uid()::text, 'admin'::app_role));
CREATE POLICY "Students can view own enrollments" ON public.enrollments FOR SELECT USING (auth.uid()::text = student_id);
CREATE POLICY "Admins can manage all enrollments" ON public.enrollments FOR ALL USING (has_role(auth.uid()::text, 'admin'::app_role));
CREATE POLICY "Tutors can view enrollments for their courses" ON public.enrollments FOR SELECT USING (EXISTS (SELECT 1 FROM tutor_courses tc WHERE tc.tutor_id = auth.uid()::text AND tc.course_id = enrollments.course_id));
CREATE POLICY "Admins can view enrollment attempts" ON public.enrollment_attempts FOR SELECT USING (has_role(auth.uid()::text, 'admin'::app_role));
CREATE POLICY "Students can view own progress" ON public.lesson_progress FOR SELECT USING (auth.uid()::text = student_id);
CREATE POLICY "Students can update own progress" ON public.lesson_progress FOR INSERT WITH CHECK (auth.uid()::text = student_id);
CREATE POLICY "Students can mark lessons complete" ON public.lesson_progress FOR UPDATE USING (auth.uid()::text = student_id);
CREATE POLICY "Admins can view all progress" ON public.lesson_progress FOR SELECT USING (has_role(auth.uid()::text, 'admin'::app_role));
CREATE POLICY "Tutors can view student progress" ON public.lesson_progress FOR SELECT USING (EXISTS (SELECT 1 FROM lessons l JOIN tutor_courses tc ON tc.course_id = l.course_id WHERE l.id = lesson_progress.lesson_id AND tc.tutor_id = auth.uid()::text));
CREATE POLICY "Students can view own submissions" ON public.assignment_submissions FOR SELECT USING (auth.uid()::text = student_id);
CREATE POLICY "Students can submit assignments" ON public.assignment_submissions FOR INSERT WITH CHECK (auth.uid()::text = student_id);
CREATE POLICY "Admins can manage all submissions" ON public.assignment_submissions FOR ALL USING (has_role(auth.uid()::text, 'admin'::app_role));
CREATE POLICY "Tutors can grade submissions" ON public.assignment_submissions FOR UPDATE USING (EXISTS (SELECT 1 FROM assignments a JOIN tutor_courses tc ON tc.course_id = a.course_id WHERE a.id = assignment_submissions.assignment_id AND tc.tutor_id = auth.uid()::text));
CREATE POLICY "Tutors can view submissions for their courses" ON public.assignment_submissions FOR SELECT USING (EXISTS (SELECT 1 FROM assignments a JOIN tutor_courses tc ON tc.course_id = a.course_id WHERE a.id = assignment_submissions.assignment_id AND tc.tutor_id = auth.uid()::text));
CREATE POLICY "Tutors can view their assigned courses" ON public.tutor_courses FOR SELECT USING (auth.uid()::text = tutor_id);
CREATE POLICY "Admins can manage tutor assignments" ON public.tutor_courses FOR ALL USING (has_role(auth.uid()::text, 'admin'::app_role));
CREATE POLICY "Admins can manage all lessons" ON public.lessons FOR ALL USING (has_role(auth.uid()::text, 'admin'::app_role));
CREATE POLICY "Tutors can manage lessons for their courses" ON public.lessons FOR ALL USING (EXISTS (SELECT 1 FROM tutor_courses tc WHERE tc.tutor_id = auth.uid()::text AND tc.course_id = lessons.course_id));
CREATE POLICY "Admins can manage all assignments" ON public.assignments FOR ALL USING (has_role(auth.uid()::text, 'admin'::app_role));
CREATE POLICY "Tutors can manage assignments for their courses" ON public.assignments FOR ALL USING (EXISTS (SELECT 1 FROM tutor_courses tc WHERE tc.tutor_id = auth.uid()::text AND tc.course_id = assignments.course_id));
CREATE POLICY "Admins can manage all materials" ON public.lesson_materials FOR ALL USING (has_role(auth.uid()::text, 'admin'::app_role));
CREATE POLICY "Tutors can manage materials for their courses" ON public.lesson_materials FOR ALL USING (EXISTS (SELECT 1 FROM lessons l JOIN tutor_courses tc ON tc.course_id = l.course_id WHERE l.id = lesson_materials.lesson_id AND tc.tutor_id = auth.uid()::text));
CREATE POLICY "Enrolled students can view lesson materials" ON public.lesson_materials FOR SELECT USING (EXISTS (SELECT 1 FROM lessons l JOIN enrollments e ON e.course_id = l.course_id WHERE l.id = lesson_materials.lesson_id AND e.student_id = auth.uid()::text AND e.status = 'active'));
CREATE POLICY "Admins can manage courses" ON public.courses FOR ALL USING (has_role(auth.uid()::text, 'admin'::app_role));
CREATE POLICY "Admins can manage course phases" ON public.course_phases FOR ALL USING (has_role(auth.uid()::text, 'admin'::app_role));
CREATE POLICY "Admins can view role change audit" ON public.role_change_audit FOR SELECT USING (has_role(auth.uid()::text, 'admin'::app_role));

-- Recreate storage policies
CREATE POLICY "Students can upload submission files" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'assignments' AND (storage.foldername(name))[1] = 'submissions' AND (storage.foldername(name))[2] = auth.uid()::text
);
CREATE POLICY "Students can view own submission files" ON storage.objects FOR SELECT USING (
  bucket_id = 'assignments' AND (storage.foldername(name))[1] = 'submissions' AND (storage.foldername(name))[2] = auth.uid()::text
);
CREATE POLICY "Tutors can view submission files" ON storage.objects FOR SELECT USING (
  bucket_id = 'assignments' AND (storage.foldername(name))[1] = 'submissions' AND EXISTS (SELECT 1 FROM tutor_courses tc WHERE tc.tutor_id = auth.uid()::text)
);
CREATE POLICY "Admins can manage all assignment files" ON storage.objects FOR ALL USING (
  bucket_id = 'assignments' AND has_role(auth.uid()::text, 'admin'::app_role)
);
CREATE POLICY "Tutors can upload lesson materials" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'lesson-materials' AND EXISTS (SELECT 1 FROM tutor_courses tc WHERE tc.tutor_id = auth.uid()::text)
);
CREATE POLICY "Tutors can delete their lesson materials" ON storage.objects FOR DELETE USING (
  bucket_id = 'lesson-materials' AND EXISTS (SELECT 1 FROM tutor_courses tc WHERE tc.tutor_id = auth.uid()::text)
);
CREATE POLICY "Admins can manage all lesson materials files" ON storage.objects FOR ALL USING (
  bucket_id = 'lesson-materials' AND has_role(auth.uid()::text, 'admin'::app_role)
);
CREATE POLICY "Enrolled students can view lesson materials files" ON storage.objects FOR SELECT USING (
  bucket_id = 'lesson-materials' AND (
    has_role(auth.uid()::text, 'admin'::app_role) OR
    EXISTS (SELECT 1 FROM tutor_courses tc WHERE tc.tutor_id = auth.uid()::text) OR
    EXISTS (SELECT 1 FROM lesson_materials lm JOIN lessons l ON l.id = lm.lesson_id JOIN enrollments e ON e.course_id = l.course_id WHERE lm.file_url LIKE '%' || objects.name || '%' AND e.student_id = auth.uid()::text AND e.status = 'active')
  )
);
