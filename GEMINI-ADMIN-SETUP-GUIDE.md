# Setup guide — new Gemini key + admin account

This guide is written for someone who has never done this before. Every step
says what to click and what you should see. If something looks different from
what is described, stop and check you are on the right screen before going on.

**Two rules before you start:**

1. **Never paste the new key into a chat, an email, a WhatsApp message, or a
   code file.** The only place it goes is the Vercel environment-variable box
   in Part 2. If you paste it anywhere else, treat it as leaked and start again.
2. **Never commit the key to the repo.** The code no longer contains any key —
   that is the whole point of this change. Keep it that way.

---

## Part 1 — Create a new Gemini API key

### 1.1 Open Google AI Studio

1. In your browser go to **https://aistudio.google.com/apikey**
2. Sign in with the Google account that owns the project.
3. You will see a page titled **"API keys"** with a list of existing keys.

### 1.2 Create the key

1. Click the blue **"Create API key"** button (top right).
2. A small dialog appears asking which Google Cloud project to use.
   - If you already have a project, pick it from the dropdown.
   - If you do not, choose **"Create API key in new project"**.
3. Click **"Create API key"**.
4. A new row appears in the list. The key itself is a long string starting with
   `AIza…`. Click the **copy** icon next to it.

> **Do not close this tab yet.** You need the key in Part 2. Keep it on the
> clipboard, or paste it into a password manager — not into a chat.

### 1.3 Restrict the key to the Generative Language API

This step means that even if the key leaks, it cannot be used for anything
except Gemini. It is the single most useful protection you can add.

1. Go to **https://console.cloud.google.com/apis/credentials**
2. Make sure the project selector at the top of the page shows the **same
   project** you just created the key in.
3. In the list, find the row for your new key (its name is usually
   "API key 1" or similar). Click the **pencil / edit** icon on the right.
4. On the edit page, scroll to **"API restrictions"**.
5. Select **"Restrict key"** (the radio button).
6. A dropdown appears. Tick **"Generative Language API"**.
   - If it is not in the list, click **"Manage APIs"**, search for
     "Generative Language API", and click **Enable**. Then come back.
7. Scroll to the bottom and click **"Save"**.
8. Wait about 5 minutes. Google says changes can take up to 5 minutes to apply.

### 1.4 Set a daily quota

This caps how much the key can ever cost you in one day, even if someone
abuses it.

1. Still in the Google Cloud Console, go to
   **https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas**
2. Confirm the project selector still shows your project.
3. You will see a table of quotas. Find the row named
   **"Generate content requests per day"** (or "Requests per day").
4. Tick the checkbox on that row, then click **"Edit quota"** at the top.
5. Type a daily limit. A sensible starting number is **1000** — that is far
   more than a small marketplace uses in a day, and it caps the damage.
6. Click **"Save"** / **"Submit request"**. Some projects apply it instantly;
   others show "Pending approval" and apply within a day.

### 1.5 Delete the old key

The old key was committed to the repository, so it must be treated as public
and must be switched off.

1. Go back to **https://aistudio.google.com/apikey**
2. Find the **old** key in the list. You can tell it apart because the new one
   is the one you just made.
3. Click the **trash / delete** icon on the old key's row.
4. Confirm the deletion.
5. The old key now returns an error for every request. That is what you want.

> **Order matters:** do Part 2 (add the new key to Vercel) **before** you
> delete the old one, or the site's AI features will stop working in between.

---

## Part 2 — Add the key to Vercel

### 2.1 Open the project settings

1. Go to **https://vercel.com/dashboard**
2. Click on the **jova** project.
3. Click the **"Settings"** tab at the top.
4. In the left sidebar, click **"Environment Variables"**.

### 2.2 Add the variable

1. You will see a form with three boxes: **Key**, **Value**, and a set of
   environment checkboxes.
2. In **Key**, type exactly:

   ```
   GEMINI_API_KEY
   ```

   (all capitals, underscores, no spaces)
3. In **Value**, paste the new key you copied in step 1.2.
4. Under **Environments**, tick **Production** and **Preview**.
   - You may also tick Development if you run the site locally.
5. Click **"Save"**.

### 2.3 Redeploy

Environment variables only take effect on a **new** deployment. The running
site keeps using the old values until you redeploy.

1. Click the **"Deployments"** tab at the top.
2. Find the deployment marked **Production** (it has a green "Production"
   label).
3. Click the **three dots (⋯)** on the right of that row.
4. Click **"Redeploy"**.
5. In the dialog, leave the defaults and click **"Redeploy"** again.
6. Wait for the status to turn from "Building" to **"Ready"** (usually 1–3
   minutes).

### 2.4 Check it worked

1. Open the live site and sign in as a Premium seller.
2. Go to **Seller → Listings → New listing**.
3. Open the **"Generate with AI"** panel, type a title, and press the button.
4. You should get listing copy and six banner prompts back.

If you get **"The AI service is not configured on this server"**, the variable
name is misspelled or the redeploy did not finish. Re-check step 2.2 and
redeploy again.

### 2.5 (Optional) Remove the old variable

Once the new key is working, you can delete the old `NEXT_PUBLIC_GEMINI_KEY`
variable in the same Environment Variables screen. The code still falls back to
it, so deleting it is safe — but only after step 2.4 has passed.

---

## Part 3 — Create the admin user

The admin console is now protected. To get in you need two things: a normal
Supabase account, and a row in the `admin_users` table that marks that account
as staff.

### 3.1 Create the account

1. Go to **https://supabase.com/dashboard** and open your project.
2. In the left sidebar click **"Authentication"**.
3. Click **"Users"**.
4. Click the **"Add user"** button (top right), then **"Create new user"**.
5. Fill in:
   - **Email**: the admin's email address
   - **Password**: a strong password (save it in a password manager)
   - Leave **"Auto Confirm User"** ticked — otherwise the account cannot sign
     in until the email is confirmed.
6. Click **"Create user"**.
7. The new user appears in the list. **Copy their User UID** — it is the long
   string in the "UID" column. You need it in the next step.

### 3.2 Mark the account as admin

1. Still in Supabase, click **"Table Editor"** in the left sidebar.
2. Click the **`admin_users`** table.
3. Click **"Insert"** → **"Insert row"**.
4. Fill in:
   - **user_id**: paste the UID you copied in step 3.1
   - **email**: the same email address
5. Click **"Save"**.
6. The row appears in the table. That is the whole admin grant — the app reads
   this exact row.

### 3.3 Sign in to the console

1. Go to **https://your-site.com/admin-fuckliving**
2. Because you are not signed in, you are sent to the admin sign-in page.
3. Enter the admin email and password from step 3.1.
4. You land on the admin dashboard.

**What to expect if something is wrong:**

| What you see | What it means | Fix |
|---|---|---|
| Sent back to the sign-in page in a loop | The account has no `admin_users` row | Redo step 3.2 |
| "That email and password don't match" | Wrong password, or the account was never created | Redo step 3.1 |
| A "Page not found" screen | You are signed in, but not as an admin | Redo step 3.2, then sign out and in again |
| Signed in, but sent to the normal home page | You used the admin page with a non-admin account | That is intended — use the admin account |

### 3.4 Removing an admin

Delete their row from `admin_users` in the Table Editor. They lose access on
their next page load — the check runs on every request, not just at sign-in.

---

## Quick checklist

- [ ] New key created in AI Studio
- [ ] Key restricted to **Generative Language API**
- [ ] Daily quota set (e.g. 1000 requests/day)
- [ ] `GEMINI_API_KEY` added in Vercel for **Production** and **Preview**
- [ ] Redeployed, status **Ready**
- [ ] AI listing tested on the live site
- [ ] Old key deleted in AI Studio
- [ ] Admin account created in Supabase Auth
- [ ] Row added to `admin_users`
- [ ] Admin console sign-in tested
