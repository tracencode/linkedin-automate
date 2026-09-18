# Privacy policy

This app posts content to the LinkedIn account of the person who signed in.

**Who it is for.** Personal use by the app owner. It is not a public product and is not offered to other people.

**Data collected.** When you sign in with LinkedIn, the app receives an access token, a refresh token, your LinkedIn member id, and your name. Drafts and published posts are stored on the machine or repository that runs the app.

**How data is used.** Tokens are used only to publish posts you approved or scheduled. The app does not sell data, run ads, or send your LinkedIn data to anyone else except LinkedIn’s posting API and, if enabled, an OpenAI-compatible model to draft post text.

**Retention.** Tokens stay in a local `.data/tokens.json` file (or in your own CI secrets) until you delete them. You can revoke access at any time from LinkedIn → Settings → Data privacy → Other applications.

**Contact.** The app owner is the person operating this repository.
