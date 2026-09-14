-- Independent Girls/Boys gender for a meet-style session, separate from its
-- (optional) divisionId - see prisma/schema.prisma Event.gender comment.
ALTER TABLE "Event" ADD COLUMN "gender" "Gender";
