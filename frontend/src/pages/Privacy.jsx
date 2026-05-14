export default function Privacy() {
  return (
    <div className="min-h-screen bg-black text-white px-8 py-16">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">
          Privacy Policy
        </h1>

        <p className="mb-6">
          MailPilot values your privacy and protects your personal information.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">
          Information We Access
        </h2>

        <p className="mb-4">
          MailPilot uses Google authentication and Gmail permissions only after
          a user grants explicit authorization.
        </p>

        <p className="mb-4">
          We access Gmail functionality solely to send outreach emails,
          schedule campaigns, and track replies on behalf of authenticated
          users.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">
          Data Usage
        </h2>

        <p className="mb-4">
          User data is used only to provide MailPilot features and improve
          service functionality.
        </p>

        <p className="mb-4">
          We do not sell, rent, or share user information with third parties.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">
          Security
        </h2>

        <p className="mb-4">
          Authentication credentials and tokens are stored securely.
        </p>

        <p className="mb-4">
          Users may revoke MailPilot access from their Google account settings
          at any time.
        </p>

        <p className="mt-10 text-gray-400">
          Last Updated: May 2026
        </p>
      </div>
    </div>
  );
}