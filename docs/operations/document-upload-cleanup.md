# Document upload cleanup failures

If document metadata cannot be saved and the subsequent blob deletion also fails, the upload API returns `document_cleanup_incomplete` with a random document reference. The user is asked to contact support with that reference. The server logs the same reference and event name without the document name, contents, account identifier, storage path or underlying error.

An authorised operator can use the reference to investigate the private document storage inventory for a path ending in `/<reference>.enc` and verify its metadata state. Treat storage paths and account identifiers as private. Do not infer that an object is safe to remove merely from a support message; verify the exact object and use the normal authorised incident and deletion process. The error response does not itself delete or recover the object, and cleanup can still require operator action.
