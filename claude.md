## Project Overview

This is a full-scale SaaS platform for creative agencies to manage end-to-end workflows including CRM, project management, quotations, asset management, collaboration, and finance.

The goal is to build a highly scalable, modular, and user-friendly system that connects all workflows seamlessly.

---

## Core Philosophy

* Keep UI clean and minimal
* Avoid unnecessary complexity
* Everything must be relational and connected
* Prioritize usability over feature overload

---

## Tech Stack

* Frontend: Next.js (App Router, TypeScript, Tailwind)
* Backend: Node.js (API routes or Express)
* Database: PostgreSQL
* ORM: Prisma
* Storage: AWS S3
* Realtime: WebSockets (later phase)

---

## Core Modules

1. Client CRM
2. Project Management
3. Task System (hierarchical)
4. File & Asset Management
5. Quotation System
6. Dashboard

---

## Key Functional Requirements

### Client CRM

* Store client details, contacts, and brand assets
* Maintain project and financial history

### Project System

* Support multiple projects per client
* Support retainer and one-time projects
* Each project contains tasks, files, and communication

### Task System

* Hierarchical tasks (parent → child → micro tasks)
* Assign users and managers
* Track progress automatically

### Quotation System

* Dynamic quotation builder
* Rate card system
* Convert quotation → project → tasks → invoice

### File Management

* Store files at client, project, and task levels
* Support versioning and tagging

---

## Coding Guidelines

* Write clean, modular, scalable code
* Use reusable components
* Maintain proper folder structure
* Avoid hardcoding values
* Use environment variables

---

## UI/UX Guidelines

* Minimal and modern UI
* Dashboard-driven design
* Avoid clutter
* Focus on usability for agencies

---

## Development Rules

* Build module by module
* Always explain code in simple terms
* Suggest improvements if something is inefficient
* Do not over-engineer

---

## Output Expectations

* Provide complete working code
* Include folder structure
* Include database schema
* Include API routes
* Explain how to run the code

---
