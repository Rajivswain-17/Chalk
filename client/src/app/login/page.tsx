import { AuthForm } from "@/components/AuthForm";
import { AuthSplit } from "@/components/AuthSplit";
import { getAuthProviders } from "@/lib/api";

// /login — split-screen shell: dark brand panel + auth column.
// Dynamic (searchParams) by design; providers fetch hides dead OAuth buttons.

interface LoginPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function first(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const query = await searchParams;
  // Providers endpoint is public; failure (backend down) hides OAuth buttons
  // and the form's error path explains the outage on submit.
  const providers = await getAuthProviders().catch(() => ({
    google: false,
    github: false,
  }));

  return (
    <AuthSplit eyebrow="AI whiteboard videos">
      <AuthForm
        mode="login"
        next={first(query.next)}
        oauthError={first(query.error)}
        providers={providers}
      />
    </AuthSplit>
  );
}
