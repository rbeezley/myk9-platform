List ALL available skills by scanning the filesystem (not just what's shown in context, which may be truncated).

## Scan Locations

1. **Project skills**: Glob for `.claude/skills/*/SKILL.md` in the current project
2. **User skills**: Glob for `C:\Users\Richard\.claude\skills\*\SKILL.md`
3. **Plugin skills**: Glob for `C:\Users\Richard\.claude\plugins\marketplaces\**\SKILL.md`

## For Each Skill Found

Read the SKILL.md frontmatter (just the YAML between `---` markers) to extract:
- `name` - The skill name
- `description` - First sentence only (truncate if needed)

## Output Format

Group by source and format as clean tables:

### Project Skills (from .claude/skills/)
| Skill Name | Description |
|------------|-------------|
| `skill-name` | Brief description... |

### User Skills (from ~/.claude/skills/)
| Skill Name | Description |
|------------|-------------|
| `skill-name` | Brief description... |

### Plugin Skills (from installed marketplaces)
| Skill Name | Description |
|------------|-------------|
| `marketplace:skill-name` | Brief description... |

## Important
- Only list skills - do not invoke any of them
- Show the total count at the end
- If a SKILL.md is missing frontmatter, note it as "(no description)"
