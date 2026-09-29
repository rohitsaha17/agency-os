-- PERF-007: additive indexes matching hot query shapes. All CREATE INDEX only;
-- no data or column changes.

-- GET /api/tasks list: org + soft-delete + status filter.
CREATE INDEX "tasks_organizationId_deletedAt_status_idx" ON "tasks"("organizationId", "deletedAt", "status");
-- Dashboard overdue/upcoming + task ordering: org + soft-delete, ranged/ordered by dueDate.
CREATE INDEX "tasks_organizationId_deletedAt_dueDate_idx" ON "tasks"("organizationId", "deletedAt", "dueDate");
-- Subtask/children lookups (task detail, project board, next-sibling order).
CREATE INDEX "tasks_parentId_idx" ON "tasks"("parentId");
-- Activity feed: org-scoped, ordered by changedAt desc.
CREATE INDEX "status_history_organizationId_changedAt_idx" ON "status_history"("organizationId", "changedAt");
