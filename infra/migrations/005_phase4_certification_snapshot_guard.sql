CREATE OR REPLACE FUNCTION app.certification_run_snapshot_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.summary = COALESCE(NEW.summary, '{}'::jsonb)
      || jsonb_build_object(
        'configurationHash',
        app.connector_certification_hash(NEW.connector_id)
      );
    RETURN NEW;
  END IF;

  IF OLD.summary ? 'configurationHash'
     AND NOT (COALESCE(NEW.summary, '{}'::jsonb) ? 'configurationHash') THEN
    NEW.summary = COALESCE(NEW.summary, '{}'::jsonb)
      || jsonb_build_object(
        'configurationHash',
        OLD.summary->>'configurationHash'
      );
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER provider_certification_runs_snapshot_guard
BEFORE INSERT OR UPDATE ON provider_certification_runs
FOR EACH ROW EXECUTE FUNCTION app.certification_run_snapshot_guard();
