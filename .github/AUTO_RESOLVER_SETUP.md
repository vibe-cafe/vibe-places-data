# Auto Issue Resolver Setup Guide

This guide explains how to set up the automated issue resolver workflow for `vibe-places-data`.

## Overview

The auto issue resolver workflow:
1. Triggers when an issue is labeled with both "待审核" and either "新增地点" or "更新地点"
2. Uses AI API (OpenRouter or OpenAI) to extract place data from the issue
3. Downloads images from the issue
4. Creates a Pull Request with the changes
5. Automatically handles PR merges to update issue labels and close issues

## Prerequisites

- GitHub repository: `vibe-cafe/vibe-places-data`
- AI API account: **OpenRouter** (recommended) or **OpenAI**
- Repository write permissions for GitHub Actions

## Setup Steps

### Option 1: Using OpenRouter (Recommended) ⭐

**Why OpenRouter?**
- ✅ Often cheaper than OpenAI direct
- ✅ Access to multiple AI models
- ✅ Unified API for different providers
- ✅ Better rate limits and reliability

**Steps:**

1. **Get OpenRouter API Key**
   - Go to [OpenRouter.ai](https://openrouter.ai/)
   - Sign up or log in
   - Navigate to [Keys](https://openrouter.ai/keys)
   - Click "Create Key"
   - Copy the API key (starts with `sk-or-v1-...`)

2. **Add Secrets to GitHub Repository**
   - Go to: `https://github.com/vibe-cafe/vibe-places-data/settings/secrets/actions`
   - Click **New repository secret**
   - Name: `OPENROUTER_API_KEY`
   - Value: Paste your OpenRouter API key
   - Click **Add secret**
   
   **Optional:** Set a custom model (defaults to `x-ai/grok-code-fast-1`)
   - Name: `OPENROUTER_MODEL`
   - Value: e.g., `x-ai/grok-code-fast-1` (default), `openai/gpt-4o-mini`, `anthropic/claude-3-haiku`, `google/gemini-flash-1.5`

3. **Create Personal Access Token (Required for PR Creation)**
   
   GitHub Actions has restrictions on creating PRs. You need a Personal Access Token:
   
   - Go to [GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens)
   - Click **Generate new token (classic)**
   - Name: `vibe-places-data-auto-resolver`
   - Select scopes:
     - ✅ `repo` (Full control of private repositories)
     - ✅ `workflow` (Update GitHub Action workflows)
   - Click **Generate token**
   - **Copy the token immediately** (you won't see it again!)
   - Go back to repository secrets: `https://github.com/vibe-cafe/vibe-places-data/settings/secrets/actions`
   - Click **New repository secret**
   - Name: `GH_PAT`
   - Value: Paste your Personal Access Token
   - Click **Add secret**
   
   **Important:** The workflow will use `GH_PAT` if available, otherwise fall back to `GITHUB_TOKEN` (which may not work for PR creation).

**Popular OpenRouter Models:**
- `x-ai/grok-code-fast-1` - Fast and optimized for code/data extraction (default)
- `openai/gpt-4o-mini` - Fast and cheap
- `anthropic/claude-3-haiku` - Very fast, good quality
- `google/gemini-flash-1.5` - Fastest, very cheap
- `openai/gpt-4o` - Higher quality (more expensive)

### Option 2: Using OpenAI Direct

1. **Get OpenAI API Key**
   - Go to [OpenAI Platform](https://platform.openai.com/)
   - Sign up or log in
   - Navigate to [API Keys](https://platform.openai.com/api-keys)
   - Click "Create new secret key"
   - Copy the API key (you won't be able to see it again)

2. **Add Secret to GitHub Repository**
   - Go to: `https://github.com/vibe-cafe/vibe-places-data/settings/secrets/actions`
   - Click **New repository secret**
   - Name: `OPENAI_API_KEY`
   - Value: Paste your OpenAI API key
   - Click **Add secret**

**Note:** The workflow will use `gpt-4o-mini` model which is cost-effective.

### 3. Verify Workflow Files

Ensure these files exist in your repository:

- `.github/workflows/auto-issue-resolver.yml` - Main workflow
- `.github/workflows/handle-pr-merge.yml` - PR merge handler
- `.github/scripts/process-issue.js` - Processing script

### 4. Test the Workflow

1. Create a test issue using the "添加新地点" template
2. Add both labels: "待审核" and "新增地点"
3. The workflow should automatically trigger
4. Check the Actions tab to see the workflow run

## How It Works

### Issue Processing Flow

```
Issue Created with Labels
    ↓
Workflow Triggers (labeled event)
    ↓
Check Labels (待审核 + 新增地点/更新地点)
    ↓
Extract Data with AI (OpenRouter/OpenAI)
    ↓
Validate & Process Data
    ↓
Download Image (if new place)
    ↓
Update places.json
    ↓
Create Branch & Commit
    ↓
Create Pull Request
    ↓
Comment on Issue with PR Link
```

### PR Merge Flow

```
PR Merged
    ↓
Workflow Triggers (pull_request closed)
    ↓
Update Issue Labels (待审核 → 通过)
    ↓
Close Issue
```

### PR Rejected Flow

```
PR Closed (not merged)
    ↓
Workflow Triggers
    ↓
Update Issue Labels (待审核 → 拒绝)
```

## Features

### For New Places
- ✅ Extracts all place information from issue form
- ✅ Downloads image from issue attachments/comments
- ✅ Generates unique slug-based ID
- ✅ Validates required fields
- ✅ Creates PR with proper formatting

### For Updates
- ✅ Matches place by name
- ✅ Only updates provided fields
- ✅ Handles multiple matches (fails with comment)
- ✅ Preserves existing data

### Error Handling
- ✅ Comments on issue with error details
- ✅ Creates notification issue for maintainer
- ✅ Validates data before creating PR

## Troubleshooting

### Workflow Not Triggering

**Problem:** Workflow doesn't run when labels are added.

**Solution:** 
- Ensure both required labels are present: "待审核" AND ("新增地点" OR "更新地点")
- Check Actions tab for workflow runs
- Verify workflow file is in `.github/workflows/` directory

### AI API Errors

**Problem:** "OpenRouter API error" or "OpenAI API error" in workflow logs.

**Solution:**
- **If using OpenRouter:**
  - Verify `OPENROUTER_API_KEY` secret is set correctly
  - Check OpenRouter account has credits at https://openrouter.ai/credits
  - Review API usage at https://openrouter.ai/activity
- **If using OpenAI:**
  - Verify `OPENAI_API_KEY` secret is set correctly
  - Check OpenAI account has credits/quota
  - Review API usage at https://platform.openai.com/usage
- **Note:** The workflow prefers OpenRouter if `OPENROUTER_API_KEY` is set, otherwise falls back to OpenAI

### Image Download Fails

**Problem:** Image not found or download fails.

**Solution:**
- Ensure image is uploaded to issue (drag & drop in GitHub UI)
- Image should appear in issue body or comments
- Check image URL format (GitHub user-images URLs are supported)

### PR Creation Fails

**Problem:** "Failed to create PR" error.

**Solution:**
- Verify GitHub token has write permissions
- Check branch name doesn't already exist
- Ensure `places.json` is valid JSON

## Cost Estimation

### Using OpenRouter (Recommended)

**Model: `x-ai/grok-code-fast-1`** (default):
- Optimized for code and data extraction tasks
- Fast response times
- Cost-effective for structured data extraction
- Typical issue processing: ~$0.001-0.01 per issue

**Model: `openai/gpt-4o-mini`**:
- ~$0.15 per 1M input tokens
- ~$0.60 per 1M output tokens
- Typical issue processing: ~$0.001-0.01 per issue

**Model: `anthropic/claude-3-haiku`**:
- ~$0.25 per 1M input tokens
- ~$1.25 per 1M output tokens
- Similar quality, slightly faster

**Model: `google/gemini-flash-1.5`**:
- ~$0.075 per 1M input tokens
- ~$0.30 per 1M output tokens
- Cheapest option, very fast

**Monthly estimate:** ~$0.50-3 for moderate usage (50-100 issues/month)

### Using OpenAI Direct

**Model: `gpt-4o-mini`**:
- ~$0.15 per 1M input tokens
- ~$0.60 per 1M output tokens
- Typical issue processing: ~$0.001-0.01 per issue

**Monthly estimate:** ~$1-5 for moderate usage (50-100 issues/month)

**💡 Tip:** OpenRouter often provides better rates and more flexibility!

## Maintenance

### Updating the Script

1. Edit `.github/scripts/process-issue.js`
2. Commit and push changes
3. Workflow will use updated script on next run

### Monitoring

- Check Actions tab regularly for failed runs
- Review error notifications in issues
- Monitor AI API usage:
  - OpenRouter: https://openrouter.ai/activity
  - OpenAI: https://platform.openai.com/usage

## Support

If you encounter issues:
1. Check workflow logs in Actions tab
2. Review error comments on issues
3. Check notification issues created by the workflow

