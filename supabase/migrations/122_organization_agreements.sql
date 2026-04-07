-- Organization Entry Agreements
-- Each sanctioning organization (AKC, UKC, NACSW, etc.) has a standard entry
-- agreement that exhibitors must accept when registering for a show.

CREATE TABLE organization_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization TEXT NOT NULL UNIQUE,
  agreement_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE organization_agreements ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read agreements (needed during registration)
CREATE POLICY "organization_agreements_select" ON organization_agreements
  FOR SELECT TO authenticated
  USING (true);

-- Only site admins can modify agreements
CREATE POLICY "organization_agreements_insert" ON organization_agreements
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_platform_admin()));

CREATE POLICY "organization_agreements_update" ON organization_agreements
  FOR UPDATE TO authenticated
  USING ((SELECT is_platform_admin()));

CREATE POLICY "organization_agreements_delete" ON organization_agreements
  FOR DELETE TO authenticated
  USING ((SELECT is_platform_admin()));

CREATE TRIGGER set_organization_agreements_updated_at
  BEFORE UPDATE ON organization_agreements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed AKC Scent Work entry agreement
INSERT INTO organization_agreements (organization, agreement_text) VALUES (
  'AKC',
  E'I certify that I am the actual owner of the dog, or that I am the duly authorized agent of the actual owner whose name I have entered.\n\nIn consideration of the acceptance of this entry, I (we) agree to abide by the rules and regulations of The American Kennel Club in effect at the time of this event, and any additional rules and regulations appearing in the premium list of this event and entry form and any decision made in accord with them. I (we) agree that the club holding this event has the right to refuse this entry for cause which the club shall deem sufficient. I (we) certify and represent that the dog entered is not a hazard to persons or other dogs.\n\nIn consideration of the acceptance of this entry and of the holding of this event and of the opportunity to have the dog judged and to win prizes, ribbons, or trophies, I (we) agree to hold the AKC, the event-giving club, their members, directors, governors, officers, agents, superintendents or event secretary and the owner and/or lessor of the premises and any provider of services that are necessary to hold this event and any employees or volunteers of the aforementioned parties, and any AKC approved judge, judging at this event, harmless from any claim for loss or injury which may be alleged to have been caused directly or indirectly to any person or thing by the act of this dog while in or about the event premises or grounds or near any entrance thereto, and I (we) personally assume all responsibility and liability for any such claim; and I (we) further agree to hold the aforementioned parties harmless from any claim of loss, injury or damage to this dog.\n\nAdditionally, I (we) hereby assume the sole responsibility for and agree to indemnify, defend and save the aforementioned parties harmless from any and all loss and expense (including legal fees) by reason of the liability imposed by law upon any of the aforementioned parties for damage because of bodily injuries, including death at any time resulting therefrom, sustained by any person or persons, including myself (ourselves), or on account of damage to property, arising out of or in consequence of my (our) participation in this event, however such injuries, death or property damage may be caused, and whether or not the same may have been caused or may be alleged to have been caused by the negligence of the aforementioned parties or any of their employees, agents, or any other person.\n\nI (we) agree that the determination of whether the injury is serious shall be made by the event veterinarian and is binding on me (us).\n\nI (WE) AGREE THAT ANY CAUSE OF ACTION, CONTROVERSY OR CLAIM ARISING OUT OF OR RELATED TO THE ENTRY, EXHIBITION OR ATTENDANCE AT THE EVENT BETWEEN THE AKC AND THE EVENT-GIVING CLUB (UNLESS OTHERWISE STATED IN THIS PREMIUM LIST) AND MYSELF (OURSELVES) OR AS TO THE CONSTRUCTION, INTERPRETATION AND EFFECT OF THIS AGREEMENT SHALL BE SETTLED BY ARBITRATION PURSUANT TO THE APPLICABLE RULES OF THE AMERICAN ARBITRATION ASSOCIATION. HOWEVER, PRIOR TO ARBITRATION ALL APPLICABLE AKC BYLAWS, RULES, REGULATIONS, AND PROCEDURES MUST FIRST BE FOLLOWED AS SET FORTH IN THE AKC CHARTER AND BYLAWS, RULES, REGULATIONS, PUBLISHED POLICIES AND GUIDELINES.'
);
