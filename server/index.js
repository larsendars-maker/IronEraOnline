// Stable Render entrypoint.
// The current engine is intentionally loaded from one place while new modules
// migrate toward clean boundaries. This keeps production stable during refactor.
import "./legacy/engine.js";
