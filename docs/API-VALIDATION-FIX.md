# Fix for Stem-Separator-API validation handler (500 → 422)

If your Railway (or other) deployment of **Stem-Separator-API** returns **500** with logs like:

- `RequestValidationError: [{'type': 'value_error', 'loc': ('body', 'file'), 'msg': "Value error, Expected UploadFile, received: ...", 'ctx': {'error': ValueError(...)}}]`
- `TypeError: Object of type ValueError is not JSON serializable`

then the **validation exception handler** is putting a raw `ValueError` (or other exception) inside the JSON response. `json.dumps()` cannot serialize exception objects, so the handler crashes and the client gets 500 instead of 422.

## Fix (API repo: `app/main.py`)

Sanitize validation error details so the response contains only JSON-serializable values (e.g. replace exception objects with their string form).

**1. Add a small helper** (e.g. before your exception handlers):

```python
def _sanitize_validation_errors(errors):
    """Return a copy of validation errors with non-JSON-serializable values replaced by strings."""
    out = []
    for err in errors:
        item = dict(err)
        if "ctx" in item and isinstance(item["ctx"], dict):
            item["ctx"] = {
                k: str(v) if isinstance(v, BaseException) else v
                for k, v in item["ctx"].items()
            }
        out.append(item)
    return out
```

(If you prefer a generic recursive sanitizer that turns any `Exception` into `str(e)` anywhere in the structure, you can do that instead.)

**2. In `validation_exception_handler`**, when building the response content, use the sanitized list:

```python
# Before (crashes when details contain ValueError):
details = {"errors": exc.errors()}  # contains ctx['error'] = ValueError(...)

# After (safe for JSON):
details = {"errors": _sanitize_validation_errors(exc.errors())}
```

Then build your `JSONResponse(status_code=422, content={...})` using `details` so that the response never contains raw exception instances.

**3. Optional:** Ensure the `/api/v1/separate` endpoint expects **multipart/form-data** with a file part named `file`, and that the part includes a **filename** in `Content-Disposition`. The **monarch-stems** client sends the file with a filename when you pass a path or stream; upgrading the client ensures the server receives a proper file upload.

After deploying this fix, validation errors (e.g. wrong type for `file`) will return **422** with a valid JSON body instead of **500**.
