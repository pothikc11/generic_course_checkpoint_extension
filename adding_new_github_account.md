## Summary: Adding a Second GitHub Account via SSH (Windows/PowerShell)

**Goal:** Log into a new GitHub account (`pothikc11`) from an existing terminal that already uses a first account.

**Steps completed:**

1. **Created `.ssh` directory** (didn't exist):
   ```powershell
   mkdir $env:USERPROFILE\.ssh
   ```

2. **Generated a new SSH key** for the second account:
   ```powershell
   ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\id_github_account2" -C "pothikc11@email.com"
   ```

3. **Copied the public key** to clipboard:
   ```powershell
   Get-Content "$env:USERPROFILE\.ssh\id_github_account2.pub" | Set-Clipboard
   ```

4. **Added the public key** to the new GitHub account (Settings → SSH and GPG keys → New SSH key).

5. **Created `~/.ssh/config`** with a single entry (since the first account uses HTTPS, not SSH):
   ```
   Host github.com-account2
     HostName github.com
     User git
     IdentityFile ~/.ssh/id_github_account2
   ```

6. **Tested the connection:**
   ```powershell
   ssh -T git@github.com-account2
   ```
   → Accepted the host key fingerprint → received: `Hi pothikc11! You've successfully authenticated...`

**Result:** The new account is now accessible via SSH. Any repo under `pothikc11` can be cloned/pushed using:
```
git@github.com-account2:pothikc11/repo-name.git
```
The first account continues to work unchanged via HTTPS (`gh auth`).









Two issues:

1. **`remote origin already exists`** — you already have a remote named `origin`. Use `set-url` instead of `add`.

2. **`denied to pronoyc11`** — you're pushing via **HTTPS**, so Git uses your cached credential (your first account `pronoyc11`). Your SSH setup only applies to **SSH** remote URLs.

## Fix — switch the remote to SSH

```powershell
git remote set-url origin git@github.com-account2:pothikc11/generic_course_checkpoint_extension.git
git push -u origin main
```

That's it. The `github.com-account2` alias in your `~/.ssh/config` tells SSH to use `id_github_account2`, which authenticates as `pothikc11`.

> **Rule of thumb:** HTTPS remotes use your browser/credential-manager login. SSH remotes use your `~/.ssh/config` identity. Since you have two accounts, SSH is the clean way to distinguish them.

