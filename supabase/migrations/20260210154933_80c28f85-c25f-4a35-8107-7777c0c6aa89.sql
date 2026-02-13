
-- Create private bucket for bank certificates
INSERT INTO storage.buckets (id, name, public)
VALUES ('bank-certificates', 'bank-certificates', false)
ON CONFLICT (id) DO NOTHING;

-- Only admins can upload certificates
CREATE POLICY "Admins can upload bank certificates"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'bank-certificates'
  AND public.is_admin()
);

-- Only admins can view/download certificates
CREATE POLICY "Admins can read bank certificates"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'bank-certificates'
  AND public.is_admin()
);

-- Only admins can update/replace certificates
CREATE POLICY "Admins can update bank certificates"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'bank-certificates'
  AND public.is_admin()
);

-- Only admins can delete certificates
CREATE POLICY "Admins can delete bank certificates"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'bank-certificates'
  AND public.is_admin()
);
