import { z } from "zod";

export const leadsOutputSchema = z.object({
  leads: z.array(
    z.object({
      company_name: z.string().nullable(),
      company_domain: z.string().nullable(),
      linkedin_url: z.string().nullable(),
      exa_url: z.string().nullable(),
      source: z.enum(["exa", "clado"]),
      raw_data: z.string().nullable(),
    }),
  ),
});

export const contactsOutputSchema = z.object({
  contacts: z.array(
    z.object({
      lead_id: z.string(),
      name: z.string().nullable(),
      first_name: z.string().nullable(),
      email: z.string().nullable(),
      email_verified: z.boolean(),
      phone: z.string().nullable(),
      linkedin_url: z.string().nullable(),
      headline: z.string().nullable(),
      company_name: z.string().nullable(),
      clado_profile: z.string().nullable(),
      exa_company_signals: z.string().nullable(),
      contact_brief: z.string().nullable(),
    }),
  ),
});

export const peopleOutputSchema = z.object({
  people: z.array(
    z.object({
      lead_id: z.string(),
      name: z.string().nullable(),
      first_name: z.string().nullable(),
      linkedin_url: z.string().nullable(),
      headline: z.string().nullable(),
      company_name: z.string().nullable(),
      raw_data: z.string().nullable(),
    }),
  ),
});

export const scoresOutputSchema = z.object({
  scores: z.array(
    z.object({
      contact_id: z.string(),
      score: z.number(),
      tier: z.enum(["hot", "warm", "cold", "disqualified"]),
      reasoning: z.string(),
      positive_signals: z.array(z.string()),
      negative_signals: z.array(z.string()),
      recommended_angle: z.string().nullable(),
      next_action: z.enum(["email", "manual_review", "discard"]),
    }),
  ),
});

export const emailsOutputSchema = z.object({
  emails: z.array(
    z.object({
      contact_id: z.string(),
      subject: z.string(),
      body_html: z.string(),
      sent: z.boolean(),
      gmail_thread_id: z.string().nullable(),
    }),
  ),
});
