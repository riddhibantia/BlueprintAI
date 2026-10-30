"""Persistence helpers for generated artifacts.

Generators are deterministic, so persistence has to be too. Re-running a
generator used to skip rows that already existed, which meant a regenerated
requirement left the old story text — and its approval — in place. These
helpers upsert by code: content follows the generator, and an approval
survives only while the content it covered is unchanged.
"""
from sqlalchemy.orm import Session

from app.models.db import AcceptanceCriteria, TraceabilityLink, UserStory
from app.traceability.engine import add_link


def sync_stories(db: Session, project_id: str, stories: list[dict]) -> dict:
    """Upsert generated stories by code; drop stories whose requirement is gone."""
    live_reqs = {s["requirement_code"] for s in stories}

    removed = 0
    for row in db.query(UserStory).filter_by(project_id=project_id).all():
        if row.requirement_code not in live_reqs:
            db.query(AcceptanceCriteria).filter_by(story_id=row.id).delete()
            db.query(TraceabilityLink).filter_by(project_id=project_id, target_type="story",
                                                target_id=row.code).delete()
            db.delete(row)
            removed += 1

    updated = 0
    for s in stories:
        row = db.query(UserStory).filter_by(project_id=project_id, code=s["code"]).first()
        if row:
            moved = (row.title, row.story, row.requirement_code) != (
                s["title"], s["story"], s["requirement_code"])
            row.title, row.story = s["title"], s["story"]
            row.requirement_code = s["requirement_code"]
            if moved and row.status == "approved":
                row.status = "draft"  # the old approval covered the old text
            db.query(AcceptanceCriteria).filter_by(story_id=row.id).delete()
            updated += 1
        else:
            row = UserStory(project_id=project_id, code=s["code"], title=s["title"],
                            story=s["story"], requirement_code=s["requirement_code"],
                            status=s["status"])
            db.add(row)
            db.flush()
        # A story implements exactly one requirement: drop a link left over from
        # the requirement it used to belong to.
        db.query(TraceabilityLink).filter(
            TraceabilityLink.project_id == project_id,
            TraceabilityLink.target_type == "story",
            TraceabilityLink.target_id == s["code"],
            TraceabilityLink.source_id != s["requirement_code"]).delete(synchronize_session=False)
        for ac in s.get("acceptance", []):
            db.add(AcceptanceCriteria(project_id=project_id, story_id=row.id, text=ac))
        add_link(db, project_id, "requirement", s["requirement_code"],
                 "story", s["code"], "implements")

    return {"created": len(stories) - updated, "updated": updated, "removed": removed}
