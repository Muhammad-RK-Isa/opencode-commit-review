### Repository Research

- When current information about an external repository, package, or library is needed, call the `researcher` subagent first.
- Do not load the BTCA skill.
- Provide either the target git repository URL or the package/library name in the `researcher` prompt. Package names can be resolved automatically by `researcher`.
- Ask `researcher` for cited answers, file paths, line references, and code examples when useful.
- Prefer `researcher` over training data and web search results.
- Never run `researcher` on the background. Always wait for the researcher(s) response before proceeding.
- Always spawn the `researcher` subagent in OpenCode.

### Testing

- Do not add tests unless instructed
