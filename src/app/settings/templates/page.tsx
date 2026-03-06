import { TemplateChatManager } from "@/components/templates/template-chat-manager";
import { listEmailTemplates, getEmailTemplateVersions } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

export default async function TemplatesSettingsPage() {
  const templates = await listEmailTemplates();

  const hydratedTemplates = await Promise.all(
    templates.map(async (template) => {
      const versions = await getEmailTemplateVersions(template.id);
      return {
        ...template,
        versions,
        activeVersion: versions.find((item) => item.id === template.active_version_id) ?? versions[0] ?? null,
      };
    }),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Template Repository</h1>
        <p className="text-sm text-muted-foreground">
          Build global cold-email templates using natural language, then launch A/B experiments per campaign.
        </p>
      </div>
      <TemplateChatManager
        initialTemplates={hydratedTemplates}
      />
    </div>
  );
}
