import { AuthForm } from "@/components/AuthForm";
import { AuthSplit } from "@/components/AuthSplit";
import { getAuthProviders } from "@/lib/api";

// /signup — mirrors /login (name field + account copy via AuthForm mode).

interface SignupPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function first(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const query = await searchParams;
  const providers = await getAuthProviders().catch(() => ({
    google: false,
    github: false,
  }));

  return (
    <AuthSplit eyebrow="AI whiteboard videos">
      <AuthForm
        mode="signup"
        next={first(query.next)}
        oauthError={first(query.error)}
        providers={providers}
      />
    </AuthSplit>
  );
}
