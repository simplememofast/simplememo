# Notion dependency review

On 2026-09-07, source inspection of API commit `d712aed8f86155805704f28374e9e98cffbc4aa1` confirmed that `src/notion-client.ts` constructs pages containing memo text, title, capture time and capture ID, and `src/notion.ts` sends the payload to `/pages`. This is code evidence, not observed production traffic. Notion is recorded as a discovered dependency pending review; it is not approved for contracts or payments.

Read the full public [Developer Terms](https://notion.notion.site/Developer-Terms-ba4131408d0844e08330da2cbb225c20), updated April 2, 2026. Section 5.8 reserves API fees. Publisher support, privacy and data-subject obligations remain its responsibility. API termination and breaking-change provisions do not establish uninterrupted access. Actual publisher acceptance and workspace contractual roles remain unverified.

Read the full [DPA](https://notion.notion.site/Data-Processing-Addendum-361b540101274b1fa7e16b90402b0d99), sections 1–9 and Annexes I–II, updated August 14, 2026. It supplements the customer MSA; OAuth integration alone does not establish SimpleMemo's coverage. Section 9.5 excludes sensitive data, which requires reconciliation with free-form memo delivery. Incident notice has no fixed hourly deadline; assistance may incur fees. Termination does not imply immediate backup deletion. Subprocessor notices require subscription. No subscription email was sent.

Read the complete [Service Level Terms](https://notion.notion.site/Service-Level-Terms-6f805fa1d4ca4463b805e2832ae8ff0d). Monthly 99.9% availability excludes weekends, holidays, maintenance and certain external causes. Credits require written notice within 72 hours and have limits. Applicability to this API integration and the relevant subscription is unverified.

Read the complete [subprocessor list](https://notion.notion.site/Notion-s-List-of-Subprocessors-268fa5bcfa0f46b6bc29436b21676734). It distinguishes infrastructure, platform, support, business operations, affiliates and Calendar. AWS lists several regions; platform providers include AI services. This list does not establish which providers or regions process SimpleMemo users' individual pages. No per-workspace configuration or network trace was inspected.

Remaining work: reconcile publisher/workspace contract roles, charges, sensitive-data restrictions, actual routing, retention/deletion and recovery. MSA and Security Exhibit remain unread in this review. These findings close reading gaps only; they do not complete the portfolio DPA task or change the execution score.
