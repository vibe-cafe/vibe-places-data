# Auto Issue Resolver - Implementation Summary

## Files Created

1. **`.github/workflows/auto-issue-resolver.yml`**
   - Main workflow that processes issues
   - Triggers on `labeled` event
   - Checks for required labels: "待审核" + ("新增地点" OR "更新地点")

2. **`.github/workflows/handle-pr-merge.yml`**
   - Handles PR merge/rejection
   - Updates issue labels automatically
   - Closes issues when PR is merged

3. **`.github/scripts/process-issue.js`**
   - Node.js script that processes issues
   - Uses OpenAI API to extract data
   - Handles image downloads
   - Creates PRs

4. **`.github/AUTO_RESOLVER_SETUP.md`**
   - Setup instructions
   - Troubleshooting guide

## Setup Required

### Option 1: Using OpenRouter (Recommended) ⭐

Go to: `https://github.com/vibe-cafe/vibe-places-data/settings/secrets/actions`

Add secrets:
- **Name:** `OPENROUTER_API_KEY`
- **Value:** Your OpenRouter API key from https://openrouter.ai/keys

**Optional:** Set custom model
- **Name:** `OPENROUTER_MODEL`
- **Value:** e.g., `x-ai/grok-4-fast` (default), `openai/gpt-4o-mini`, `anthropic/claude-3-haiku`, `google/gemini-flash-1.5`

**Required for PR Creation:**
- **Name:** `GH_PAT`
- **Value:** Personal Access Token with `repo` scope
- **How to create:** https://github.com/settings/tokens → Generate new token (classic) → Select `repo` scope

### Option 2: Using OpenAI Direct

Go to: `https://github.com/vibe-cafe/vibe-places-data/settings/secrets/actions`

Add secret:
- **Name:** `OPENAI_API_KEY`
- **Value:** Your OpenAI API key from https://platform.openai.com/api-keys

**Note:** The workflow prefers OpenRouter if `OPENROUTER_API_KEY` is set, otherwise falls back to OpenAI.

### 2. Verify Workflow Permissions

The workflow needs these permissions (already configured):
- `contents: write` - To create branches and commits
- `issues: write` - To comment on issues
- `pull-requests: write` - To create PRs

## How It Works

### Trigger Conditions

Workflow runs when:
- Issue is labeled with **"待审核"** AND
- Issue is labeled with **"新增地点"** OR **"更新地点"**

### Processing Steps

1. **Extract Data** - AI reads issue form and extracts structured data
2. **Validate** - Checks required fields, coordinates, etc.
3. **Handle Images** - Downloads images from issue (new places only)
4. **Update JSON** - Adds/updates `places.json`
5. **Create PR** - Creates branch, commits, and opens PR
6. **Notify** - Comments on issue with PR link

### PR Merge Handling

When PR is merged:
- Issue label changes: "待审核" → "通过"
- Issue is automatically closed
- PR links to issue (auto-closes)

When PR is rejected:
- Issue label changes: "待审核" → "拒绝"
- Issue remains open

## Features

✅ **AI-Powered Extraction** - Uses OpenRouter (recommended) or OpenAI to parse issue forms  
✅ **Image Handling** - Downloads images from GitHub issue attachments  
✅ **Slug Generation** - Creates unique IDs from place names  
✅ **Update Support** - Handles both new places and updates  
✅ **Error Handling** - Comments on errors and notifies maintainer  
✅ **Auto Labeling** - Updates issue labels based on PR status  

## Testing

To test:
1. Create a test issue using the template
2. Add labels: "待审核" and "新增地点"
3. Watch the Actions tab for workflow run
4. Check for PR creation

## Cost

**OpenRouter (Recommended):**
- `x-ai/grok-4-fast`: ~$0.001-0.01 per issue (default, optimized for data extraction)
- `openai/gpt-4o-mini`: ~$0.001-0.01 per issue
- `google/gemini-flash-1.5`: ~$0.0005-0.005 per issue (cheapest)
- `anthropic/claude-3-haiku`: ~$0.001-0.01 per issue

**OpenAI Direct:**
- `gpt-4o-mini`: ~$0.001-0.01 per issue

Very cost-effective for this use case!

## Next Steps

1. ✅ Add `OPENROUTER_API_KEY` (recommended) or `OPENAI_API_KEY` secret to repository
2. ✅ Optionally set `OPENROUTER_MODEL` to use a different model
3. ✅ Test with a sample issue
4. ✅ Monitor first few runs
5. ✅ Adjust prompts if needed (in `process-issue.js`)

## Notes

- The script uses `axios` for HTTP requests (installed in workflow)
- Images are downloaded from GitHub user-images URLs
- Slug generation handles duplicates with random suffix
- Amenities field is added as array (new field in schema)

