# Roadmap: Nanocoder

## Overview

Complete Nanocoder's core functionality by addressing identified technical debt and improving code quality. The journey progresses from infrastructure foundations (lifecycle management), through architecture improvements (state management, type safety), to quality enhancements (testing, component optimization, memory management), culminating in monitoring capabilities.

## Domain Expertise

None — General TypeScript/React patterns apply.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Infrastructure Foundation** - Proper lifecycle and resource management
- [ ] **Phase 2: State Architecture Refactor** - Consolidate state management patterns
- [ ] **Phase 3: Test Coverage Expansion** - Cover untested core components
- [ ] **Phase 4: Type Safety Improvements** - Reduce type assertions and improve typing
- [ ] **Phase 5: Component Optimization** - Split large wizard components
- [ ] **Phase 6: Memory & Performance** - Prevent memory issues in long sessions
- [ ] **Phase 7: Monitoring & Observability** - Enable health monitoring capabilities

## Phase Details

### Phase 1: Infrastructure Foundation
**Goal**: Implement proper lifecycle management with graceful shutdown and resource cleanup
**Depends on**: Nothing (first phase)
**Research**: Unlikely (internal patterns, React lifecycle)
**Plans**: 3 plans

Plans:
- [ ] 01-01: Implement ShutdownManager for graceful exit
- [ ] 01-02: Add Map cleanup strategies for MCP client
- [ ] 01-03: Add Map cleanup strategies for LSP client

### Phase 2: State Architecture Refactor
**Goal**: Consolidate useAppState from 50+ useState calls to organized reducers
**Depends on**: Phase 1
**Research**: Unlikely (established React patterns with useReducer)
**Plans**: 4 plans

Plans:
- [ ] 02-01: Design consolidated state structure and reducer pattern
- [ ] 02-02: Migrate message/conversation state to reducer
- [ ] 02-03: Migrate UI/modal state to reducer
- [ ] 02-04: Migrate connection/provider state to reducer

### Phase 3: Test Coverage Expansion
**Goal**: Add test coverage for App.tsx and other untested core components
**Depends on**: Phase 2 (state refactor may affect testability)
**Research**: Unlikely (using existing AVA patterns)
**Plans**: 3 plans

Plans:
- [ ] 03-01: Refactor App.tsx for testability (extract logic to hooks)
- [ ] 03-02: Add unit tests for App.tsx orchestration logic
- [ ] 03-03: Add integration tests for hook interactions

### Phase 4: Type Safety Improvements
**Goal**: Reduce 263 type assertions with proper TypeScript typing
**Depends on**: Phase 3 (tests provide safety net for refactoring)
**Research**: Unlikely (internal typing patterns)
**Plans**: 4 plans

Plans:
- [ ] 04-01: Add strict types for MCP client interfaces
- [ ] 04-02: Add strict types for LSP client interfaces
- [ ] 04-03: Reduce type assertions in tool system
- [ ] 04-04: Enable stricter Biome noExplicitAny rule

### Phase 5: Component Optimization
**Goal**: Split large wizard components into smaller, testable units
**Depends on**: Phase 4 (type safety provides refactoring confidence)
**Research**: Unlikely (internal UI patterns)
**Plans**: 3 plans

Plans:
- [ ] 05-01: Split provider-step.tsx into sub-components
- [ ] 05-02: Split mcp-step.tsx into sub-components
- [ ] 05-03: Add tests for refactored wizard components

### Phase 6: Memory & Performance
**Goal**: Prevent memory issues in long-running sessions
**Depends on**: Phase 2 (message state management)
**Research**: Unlikely (internal data structure patterns)
**Plans**: 2 plans

Plans:
- [ ] 06-01: Implement message history limits with pruning
- [ ] 06-02: Add bounded data structures across codebase

### Phase 7: Monitoring & Observability
**Goal**: Enable health monitoring with webhook alerts
**Depends on**: Phase 1 (infrastructure foundation)
**Research**: Likely (HTTP webhook patterns)
**Research topics**: Webhook retry patterns, HTTP client best practices, alert payload formats
**Plans**: 2 plans

Plans:
- [ ] 07-01: Implement webhook HTTP client in alert-manager
- [ ] 07-02: Add health monitoring integration tests

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure Foundation | 0/3 | Not started | - |
| 2. State Architecture Refactor | 0/4 | Not started | - |
| 3. Test Coverage Expansion | 0/3 | Not started | - |
| 4. Type Safety Improvements | 0/4 | Not started | - |
| 5. Component Optimization | 0/3 | Not started | - |
| 6. Memory & Performance | 0/2 | Not started | - |
| 7. Monitoring & Observability | 0/2 | Not started | - |
