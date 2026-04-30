# AGENT.md

Project-level instructions for OpenAI Codex and other coding agents working on ClawHermes-USB.

## Project Context

ClawHermes-USB is a Windows-first portable USB runtime suite for official OpenClaw, Hermes Agent, and EKKOLearnAI/hermes-web-ui.

The project is designed as a portable orchestration layer, not a fork of upstream tools. Keep our own logic separated from upstream application payloads.

Important boundaries:

- Generic orchestration logic belongs in `core/`.
- Service-specific integration belongs in `adapters/`.
- Upstream applications belong in `apps/`.
- Portable runtimes belong in `runtimes/`.
- Persistent user data belongs in `data/`.
- User-facing launch scripts belong in `launcher/`.
- Product and architecture documentation belongs in `docs/`.

## Commit Message Policy

Every commit message must include both English and Chinese.

Format:

```text
<type>: <English summary> (<type>: <Chinese summary>)
```

Examples:

```text
fix: correct portable path resolution (fix: 修复便携路径解析)
feat: add adapter validation command (feat: 添加适配器校验命令)
docs: expand Windows runtime design (docs: 扩展 Windows 运行时设计)
refactor: split process manager from launcher (refactor: 从启动器拆分进程管理器)
test: add port conflict checks (test: 添加端口冲突检查)
chore: update placeholder runtime folders (chore: 更新占位运行时目录)
```

Rules:

- Keep the English and Chinese summaries semantically equivalent.
- Use conventional commit types where possible: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`.
- If the commit body is needed, write it in English first, then Chinese.
- Do not use vague messages such as `update`, `misc`, or `fix stuff`.

## Multi-Agent Work Policy

When using multiple agents, the main agent should coordinate work through clear task boundaries.

Sub-agent requirements:

- Use `gpt-5.4`.
- Use high reasoning mode.
- Assign each sub-agent a narrow and independent responsibility.
- Give each sub-agent explicit file or module ownership.
- Tell sub-agents that other agents may be editing the codebase and that they must not revert unrelated changes.
- Avoid assigning overlapping write scopes to multiple sub-agents.

Recommended sub-agent task shape:

```text
You are responsible for <specific module or file set>.
Use gpt-5.4 with high reasoning.
Do not modify files outside <scope>.
Do not revert unrelated user or agent changes.
Return a concise summary and list changed files.
```

## Software Design Principles

All implementation work should follow the six major software design principles.

### Single Responsibility Principle

Each module should have one clear reason to change.

Examples:

- `core/process/` manages process lifecycle only.
- `core/ports/` manages port detection and allocation only.
- `adapters/hermes-agent/` contains Hermes Agent integration details only.

Avoid mixing launcher UI, process management, config parsing, and service-specific behavior in the same file.

### Open-Closed Principle

The system should be open for extension and closed for modification.

New services should be added through new adapters, not by editing existing OpenClaw or Hermes logic.

Prefer:

- Add `adapters/<service>/adapter.json`.
- Add service-specific scripts inside that adapter.

Avoid:

- Adding `if service == ...` branches throughout core orchestration.

### Liskov Substitution Principle

Any service adapter should be usable anywhere the core expects a generic adapter.

If an adapter declares the required fields and behavior, the orchestrator should not need to know whether it represents OpenClaw, Hermes Agent, Hermes Web UI, or a future service.

Adapter behavior must match the contract in `docs/ADAPTER_CONTRACT.md`.

### Law of Demeter

Modules should talk only to their immediate collaborators.

Examples:

- The launcher calls the orchestrator.
- The orchestrator reads adapter descriptors.
- The process manager starts commands.

Avoid deep knowledge chains such as launcher code reaching directly into service internals or upstream app directories.

### Interface Segregation Principle

Interfaces should be small and purpose-specific.

Do not force every adapter to implement features it does not need.

Examples:

- A simple static portal adapter should not need backup hooks.
- A service without custom stop behavior can use generic PID-based stop.
- Health checks should support multiple small types: HTTP, TCP, process.

### Dependency Inversion Principle

High-level orchestration should depend on abstractions, not concrete services.

Core should depend on adapter contracts and service descriptors. It should not directly depend on OpenClaw, Hermes Agent, or Hermes Web UI implementation details.

Service-specific assumptions belong in adapters.

## Implementation Guidelines

- Prefer clear, boring architecture over clever scripts.
- Keep paths relative to the project root whenever possible.
- Never hardcode drive letters.
- Do not permanently modify host machine environment variables.
- Do not install global npm or Python packages on the host for normal operation.
- Keep secrets out of committed files.
- Write logs under `data/logs/`.
- Write temporary process metadata under `data/tmp/`.
- Keep documentation updated when changing architecture or adapter behavior.

## Documentation Expectations

When changing behavior, update the relevant documents:

- Product behavior: `docs/PRD.md` and `docs/PRD.zh-CN.md`
- Architecture: `docs/DESIGN.md` and `docs/DESIGN.zh-CN.md`
- Adapter contract: `docs/ADAPTER_CONTRACT.md` and `docs/ADAPTER_CONTRACT.zh-CN.md`
- Runtime policy: `docs/windows-runtime.md` or future platform docs
- Data policy: `docs/portable-data.md`

If a decision affects long-term architecture, add a decision record under `docs/decisions/`.
