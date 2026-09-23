import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";

// The one frame every sign-in screen shares: a title a person reads first, one sentence, the form, a way elsewhere.
export function AuthCard({ title, description, children, footer }: { title: string; description: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer && <CardFooter className="justify-center text-sm text-muted-foreground">{footer}</CardFooter>}
    </Card>
  );
}
