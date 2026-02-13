**Privacy Policy for RoValra Chrome Extension**

**Effective Date:** February 13, 2026

**Introduction**

This Privacy Policy describes how the RoValra Chrome extension ("the Extension") handles user data. We are committed to protecting your privacy and ensuring transparency about our data practices.

**1. Information Collection: General Users vs. Donators**

Our data collection practices differ significantly depending on how you engage with the Extension.

**A. General Users (Non-Donators)**
For the vast majority of users who use the free features of the Extension:
*   RoValra does **not** collect, store, or transmit any personally identifiable information (PII).
*   We do not track browsing history, emails, passwords, or names.
*   The Extension primarily interacts with Roblox's services and APIs, developer-controlled APIs, and potentially other third-party APIs strictly to retrieve public data required for functionality.

**B. Donators (OAuth and Badge Features)**
For users who have voluntarily donated to support RoValra and wish to utilize exclusive features (such as Donator Badges), we collect and store specific information. This collection occurs **only** after you explicitly authenticate via **OAuth** to verify your identity.

If you are a donator and choose to authenticate, we store the following data in our secure database:
1.  **Roblox User ID:** (Public Information) To uniquely identify your account.
2.  **Roblox Username:** (Public Information) To display your identity correctly within the extension.
3.  **Donation Amount:** To track your contribution tier.
4.  **Donator Badge Status:** To remember your preference (e.g., if you have toggled your badge ON or OFF).
5.  **OAuth Tokens:** (Access & Refresh Tokens) Required to maintain your authenticated session.

**2. OAuth Authentication & Token Usage**

To manage Donator features, users must authenticate using Roblox's official OAuth system.

*   **Background Processing:** Once you authorize the extension, the authentication process operates in the **background**. This ensures a seamless experience where you do not need to manually log in every time you use the extension.
*   **Token Storage:** To maintain this background session, we are required by the OAuth protocol to store specific cryptographic keys:
    *   **Access Token:** A short-lived key that allows us to verify your identity.
    *   **Refresh Token:** A long-lived key used to generate new Access Tokens when old ones expire.

**Strict Limitations on Token Usage:**
It is critical to understand what these tokens are used for.
1.  **Read-Only Scope:** The tokens allow us to **read** your public User ID and Profile. They **DO NOT** give us access to change your Roblox password, spend your Robux, trade items, or modify your games.
2.  **Internal Modification Only:** The only "write" action permitted is modifying the visibility of your **RoValra Donator Badge**. This change occurs strictly within the **RoValra database**, not on the Roblox platform.

**Permissions Requested:**
We request the minimum permissions necessary, which are classified as **Low Risk**:

| Permission            | Description                                                      | Risk Level |
| :-------------------- | :--------------------------------------------------------------- | :--------- |
| **Read User ID**      | View your Roblox User ID to know who you are.                    | **Low**    |
| **Read User Profile** | View your username, display name, user avatar, and profile link. | **Low**    |

**3. Optional Data Sharing (PlaceIds and ServerIds)**

For certain features, the Extension sends specific, non-personal data—namely PlaceIds and serverIds—to a developer-controlled API. This data is used to enhance the functionality of the extension.

This feature is **completely optional** and can be turned off at any point in the extension's settings. When this feature is active, only the PlaceId and serverId are transmitted in the data payload. No data that could link a user to this information is explicitly logged by our software.

**4. User Rights: Access and Erasure**

We respect your control over your personal data. If you are a donator and your data is stored in our system, you have the following rights:

1.  **Right to Access:** You may request a copy of the personal data we hold about you (User ID, Username, Donation Amount, Badge Status).
2.  **Right to Erase (Right to be Forgotten):** You may request that we permanently delete your personal data from our database.
    *   *Note: This will delete your User ID, Username, and revoke/delete your OAuth Tokens. You will lose the ability to display Donator Badges.*

To exercise these rights, please contact us via email at **RoValraContact@gmail.com** with one of the following subject lines:
*   **Subject:** "Right to Access"
*   **Subject:** "Right to Erase"

**5. Data Security**

*   **General Users:** As the extension does not store or transmit personal data for general users to external servers, traditional server-side encryption for user databases is not applicable. Processing generally occurs on your local machine.
*   **Donators:** For the specific subset of users (Donators) whose data is stored:
    *   We use industry-standard security measures to protect the database containing User IDs and OAuth tokens.
    *   OAuth tokens are treated with high sensitivity and are never shared with third parties.
*   **Network Security:** All network interactions with our APIs are secured via **HTTPS** and protected by standard network infrastructure providers.

**6. Third-Party Services**

To provide its features, RoValra interacts with several Application Programming Interfaces (APIs):

1.  **Roblox's APIs:** Essential for interacting with the Roblox platform itself and performing the OAuth handshake.
2.  **Developer-Controlled APIs (Valra):** The Extension interacts with various API endpoints managed by the RoValra developer to retrieve data, manage donator records, and support functionality (including the optional sharing of PlaceIds/serverIds).
    *   **Infrastructure & Security:** **All** traffic between the Extension and any RoValra developer-controlled API is routed through **Cloudflare** for performance, optimization, and security (e.g., DDoS protection).
    *   While the RoValra extension logic does not track your IP address for analytics, standard web traffic information—including your IP address—is necessarily processed by Cloudflare to establish the connection to our APIs. This applies to *any* interaction with our servers.
    *   For information on how Cloudflare handles network data, please refer to [Cloudflare’s Privacy Policy](https://www.cloudflare.com/privacypolicy/).
3.  **Other Third-Party APIs:** The Extension may interact with other external APIs not controlled by Roblox or the developer. These are used strictly to *retrieve* public information required for specific features.

**7. Data Retention**

*   **General Users:** Since no PII is collected, there is no retention period. Network logs processed by Cloudflare are retained according to their specific security policies.
*   **Donators:** User IDs, Usernames, and OAuth tokens are retained indefinitely to allow you to maintain your donator status and badge preferences, unless you request a "Right to Erase."

**8. Children's Privacy**

The Extension is designed to be compliant with the Children's Online Privacy Protection Act (COPPA).
*   **General Use:** We do not collect personal information from children via the general use of the extension.
*   **Donation/OAuth Features:** The donation system and the associated OAuth login functionality are strictly limited to users aged **13 and older**. We do not knowingly process OAuth logins or store tokens for users under the age of 13.

**Changes to This Privacy Policy**

We may update this Privacy Policy from time to time. Any changes will be posted on this page, and we will update the “Effective Date.” Your continued use of the Extension after any changes signifies your acceptance of the new policy.

**Contact Information**

If you have any questions or concerns about this Privacy Policy, you can contact us at:

RoValraContact@gmail.com