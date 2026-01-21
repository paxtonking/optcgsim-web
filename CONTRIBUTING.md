# Contributing to OPTCGSim Web

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/optcgsim-web.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Push to your fork: `git push origin feature/your-feature-name`
6. Open a Pull Request

## Development Setup

See the [README](README.md) for installation instructions.

## Code Style

### TypeScript
- Use TypeScript for all new code
- Enable strict mode
- Define types for all function parameters and return values
- Prefer interfaces over type aliases for object shapes

### React
- Use functional components with hooks
- Use Zustand for state management
- Keep components focused and single-purpose
- Extract reusable logic into custom hooks

### Naming Conventions
- **Files:** `PascalCase` for components, `camelCase` for utilities
- **Components:** `PascalCase`
- **Functions/Variables:** `camelCase`
- **Constants:** `SCREAMING_SNAKE_CASE`
- **Types/Interfaces:** `PascalCase`

### CSS
- Use TailwindCSS utility classes
- Extract common patterns into components
- Avoid inline styles unless dynamic

## Project Structure

```
packages/
├── client/           # Frontend React app
├── server/           # Backend Node.js server
└── shared/           # Shared types and constants

tools/
└── card-importer/    # Card data extraction tools
```

## Pull Request Guidelines

### Before Submitting

- [ ] Code compiles without errors (`npm run build`)
- [ ] Tests pass (when available)
- [ ] Code follows style guidelines
- [ ] Commit messages are clear and descriptive

### PR Title Format
- `feat: Add new feature`
- `fix: Fix bug description`
- `docs: Update documentation`
- `refactor: Refactor code`
- `style: Format code`
- `test: Add tests`
- `chore: Update dependencies`

### PR Description
Include:
- What changes were made
- Why the changes were made
- Any breaking changes
- Screenshots (for UI changes)

## Commit Messages

Follow conventional commits:
```
type(scope): description

[optional body]

[optional footer]
```

Examples:
```
feat(deck-builder): add card search filters
fix(auth): resolve token refresh issue
docs(readme): update installation instructions
```

## Reporting Issues

### Bug Reports
Include:
- Description of the bug
- Steps to reproduce
- Expected behavior
- Actual behavior
- Browser/OS information
- Screenshots if applicable

### Feature Requests
Include:
- Description of the feature
- Use case / why it's needed
- Proposed implementation (optional)

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow

## Questions?

Open an issue with the `question` label or reach out to the maintainers.

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
