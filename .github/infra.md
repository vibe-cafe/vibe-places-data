# Infrastructure Design - Auto Issue Resolver

Automated workflow that processes GitHub issues to add/update place information using AI extraction.

## Overview

When an issue is labeled with `待审核` + a type label (`新增地点`, `更新地点`, or `新增地点（截图）`), the workflow:
1. Extracts place data using AI (OpenRouter + `x-ai/grok-4.1-fast`)
2. Downloads images from issue attachments
3. Creates a Pull Request with the changes
4. Updates labels when PR is merged/rejected

## Setup

### 1. Configure OpenRouter API

1. Get API key from [OpenRouter.ai](https://openrouter.ai/keys)
2. Add GitHub secret: `OPENROUTER_API_KEY`
3. Optional: Set `OPENROUTER_MODEL` (defaults to `x-ai/grok-4.1-fast`)

### 2. Configure GitHub Token

Required for PR creation:

1. Create Personal Access Token at [GitHub Settings](https://github.com/settings/tokens)
2. Scopes: `repo`, `workflow`
3. Add GitHub secret: `GH_PAT`

## Label System

**Type Labels:**
- `新增地点` - Manual form submission
- `更新地点` - Update existing place
- `新增地点（截图）` - Screenshot submission

**State Labels:**
- `待审核` - Triggers processing
- `通过` - PR merged
- `拒绝` - PR rejected

**Rules:** Each issue needs exactly one type label + `待审核`.

## How It Works

### Text Mode (Manual Form)
```
Issue → Extract from form text → Download image → Create PR
```

### Screenshot Mode
```
Issue → Download screenshot → Extract from image → Merge amenities → Create PR
```

### PR Handling
- **Merged**: Label `待审核` → `通过`, close issue
- **Rejected**: Label `待审核` → `拒绝`, keep issue open

## Files

- `.github/workflows/auto-issue-resolver.yml` - Main workflow
- `.github/workflows/handle-pr-merge.yml` - PR merge handler
- `.github/scripts/process-issue.js` - Processing script
- `.github/ISSUE_TEMPLATE/*.yml` - Issue templates
- `.github/labels.yml` - Label definitions

## AI Integration

- **Provider**: OpenRouter
- **Model**: `x-ai/grok-4.1-fast` (for all tasks)
- **Cost**: ~$0.001-0.01 per issue

## Troubleshooting

### Workflow Not Triggering
- Check labels: exactly one type label + `待审核`
- Verify workflow file exists in `.github/workflows/`

### AI API Errors
- Verify `OPENROUTER_API_KEY` secret
- Check credits: https://openrouter.ai/credits

### PR Creation Fails
- Verify `GH_PAT` secret with `repo` scope
- Check branch name doesn't exist

### Screenshot Extraction Issues
- Ensure screenshot is clear and readable
- Check workflow logs for extraction details

## Technical Details

- **Node.js**: v20
- **Dependencies**: `axios`, `@toon-format/toon`
- **Data Format**: `data/places.toon` (TOON format)
- **Images**: `images/{place-id}/main.{ext}`
- **Permissions**: `contents: write`, `issues: write`, `pull-requests: write`
