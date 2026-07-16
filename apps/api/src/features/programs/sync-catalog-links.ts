/**
 * Refresh planner catalog ↔ tracking course links after curriculum upserts.
 */
import type { PrismaClient } from '@prisma/client';
import { buildDefaultProgramSeed } from './domain';
import {
  assignTrackingCourseId,
  CURRICULUM_PLANNER_LINKS,
  DEFAULT_PREREQUISITE_EDGES,
} from '../../lib/curriculum-planner-links';

export type SyncProgramCatalogLinksResult = {
  programId: string;
  catalogCourses: number;
  linkedTrackingCourses: number;
  catalogByKey: Map<string, string>;
};

export async function syncProgramCatalogLinks(
  prisma: PrismaClient,
  programId?: string,
): Promise<SyncProgramCatalogLinksResult | null> {
  const programSeed = buildDefaultProgramSeed();
  const program = programId
    ? await prisma.program.findUnique({ where: { id: programId } })
    : await prisma.program.findUnique({
        where: { slug: programSeed.program.slug },
      });

  if (!program) {
    return null;
  }

  await prisma.catalogCourse.updateMany({
    where: { programId: program.id },
    data: { trackingCourseId: null },
  });

  const catalogByKey = new Map<string, string>();
  const usedTrackingIds = new Set<string>();
  let linkedTrackingCourses = 0;

  for (const courseSeed of programSeed.catalogCourses) {
    const link = CURRICULUM_PLANNER_LINKS.find(
      (entry) => entry.plannerCode === courseSeed.key,
    );
    const trackingCourse = link?.trackingSlug
      ? await prisma.course.findUnique({
          where: { slug: link.trackingSlug },
        })
      : null;
    const trackingCourseId = assignTrackingCourseId(
      trackingCourse?.id,
      usedTrackingIds,
    );
    if (trackingCourseId) linkedTrackingCourses += 1;

    const course = await prisma.catalogCourse.upsert({
      where: {
        programId_subjectCode_catalogNumber: {
          programId: program.id,
          subjectCode: courseSeed.subjectCode,
          catalogNumber: courseSeed.catalogNumber,
        },
      },
      update: {
        title: courseSeed.title,
        defaultUnits: courseSeed.defaultUnits,
        department: courseSeed.department,
        plannerCode: courseSeed.key,
        trackingCourseId,
      },
      create: {
        programId: program.id,
        subjectCode: courseSeed.subjectCode,
        catalogNumber: courseSeed.catalogNumber,
        title: courseSeed.title,
        defaultUnits: courseSeed.defaultUnits,
        department: courseSeed.department,
        plannerCode: courseSeed.key,
        trackingCourseId,
      },
    });
    catalogByKey.set(courseSeed.key, course.id);
  }

  for (const link of CURRICULUM_PLANNER_LINKS) {
    if (catalogByKey.has(link.plannerCode)) continue;
    const trackingCourse = link.trackingSlug
      ? await prisma.course.findUnique({
          where: { slug: link.trackingSlug },
        })
      : null;
    const trackingCourseId = assignTrackingCourseId(
      trackingCourse?.id,
      usedTrackingIds,
    );
    if (trackingCourseId) linkedTrackingCourses += 1;

    const course = await prisma.catalogCourse.upsert({
      where: {
        programId_subjectCode_catalogNumber: {
          programId: program.id,
          subjectCode: link.subjectCode,
          catalogNumber: link.catalogNumber,
        },
      },
      update: {
        title: link.title,
        defaultUnits: link.defaultUnits,
        department: link.department,
        plannerCode: link.plannerCode,
        trackingCourseId,
      },
      create: {
        programId: program.id,
        subjectCode: link.subjectCode,
        catalogNumber: link.catalogNumber,
        title: link.title,
        defaultUnits: link.defaultUnits,
        department: link.department,
        plannerCode: link.plannerCode,
        trackingCourseId,
      },
    });
    catalogByKey.set(link.plannerCode, course.id);
  }

  for (const [prereqKey, courseKey] of DEFAULT_PREREQUISITE_EDGES) {
    const catalogCourseId = catalogByKey.get(courseKey);
    const prerequisiteCourseId = catalogByKey.get(prereqKey);
    if (!catalogCourseId || !prerequisiteCourseId) continue;
    await prisma.catalogCoursePrerequisite.upsert({
      where: {
        catalogCourseId_prerequisiteCourseId: {
          catalogCourseId,
          prerequisiteCourseId,
        },
      },
      update: {},
      create: { catalogCourseId, prerequisiteCourseId },
    });
  }

  return {
    programId: program.id,
    catalogCourses: catalogByKey.size,
    linkedTrackingCourses,
    catalogByKey,
  };
}
