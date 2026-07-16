/**
 * Demo showcase seed — idempotent rich UI state for screenshot-ready demo accounts.
 * Only touches demo@nibras.dev (and instructor@nibras.dev for review queue).
 */
import {
  AssignmentSubmissionStatus,
  CommunityVoteTargetType,
  CourseRole,
  PlannedCourseSourceType,
  Prisma,
  type PrismaClient,
  ProjectStatus,
  ReviewStatus,
  SocialPlatform,
  SubmissionStatus,
  type AcademicTerm,
} from '@prisma/client';
import { getUserToday } from '@nibras/daily-problem';
import { buildRecommendedPlan } from '../features/programs/planner-validation';
import { NIBRAS_75_CURRICULUM } from '../features/competitions/practice/nibras75/curriculum';
import { recomputeUserGamificationMetrics } from '../features/gamification/user-metrics';
import { invalidateUserDashboardCache } from './cache';
import type {
  AcademicTerm as StoreAcademicTerm,
  CatalogCourseRecord,
  RequirementGroupRecord,
} from '../store';
import {
  DEFAULT_LOCAL_DEV_PASSWORD,
  resolveLocalDevPassword,
  seedCredentialPasswordForUser,
  seedLocalDevCredentials,
} from './local-dev-credentials';

export const DEMO_SHOWCASE_EMAIL = 'demo@nibras.dev';
export const INSTRUCTOR_SHOWCASE_EMAIL = 'instructor@nibras.dev';
export const DEMO_SHOWCASE_MARKER = 'nibras-demo-showcase';
export const DEMO_SHOWCASE_POST_MARKER = `<!-- ${DEMO_SHOWCASE_MARKER} -->`;

/** @deprecated Use DEFAULT_LOCAL_DEV_PASSWORD from local-dev-credentials. */
export const DEFAULT_DEMO_PASSWORD = DEFAULT_LOCAL_DEV_PASSWORD;

const DEMO_TIMEZONE = 'America/Los_Angeles';
const VETERAN_ACCOUNT_AGE_DAYS = 400;
const DAILY_HISTORY_DAYS = 365;
const VETERAN_STREAK = 94;
const VETERAN_DAILY_TOTAL = 280;
const VETERAN_NIBRAS75_SOLVES = 55;
const VETERAN_CP_TOPICS = 8;
const VETERAN_CP_PROBLEMS_PER_TOPIC = 5;

const VETERAN_ONBOARDING_PROGRESS: Record<string, boolean> = {
  'step-01': true,
  'step-02': true,
  'step-03': true,
  'step-github-app': true,
  'step-join': true,
  'step-04': true,
  'step-05': true,
  'step-06': true,
  'step-07': true,
  'step-08': true,
  'step-09': true,
};

const SHOWCASE_BADGE_CODES = [
  'github-connected',
  'github-app-ready',
  'first-enrollment',
  'first-steps',
  'first-attempt',
  'daily-streak-7',
  'daily-streak-30',
] as const;

const LEETCODE_DIFFICULTY: Record<string, number> = {
  Easy: 800,
  Medium: 1500,
  Hard: 2200,
};

export type DemoShowcaseResult = {
  skipped: boolean;
  reason?: string;
  profileUpdated: boolean;
  credentialPasswordSet: boolean;
  githubLinked: boolean;
  enrollments: number;
  plannedCourses: number;
  submissions: number;
  assignmentSubmissions: number;
  videoProgress: number;
  dailyAssignments: number;
  nibras75Progress: number;
  cpRoadmapProgress: number;
  badgesAwarded: number;
  communityPosts: number;
  communityVotes: number;
  reputationEvents: number;
};

export type DemoShowcaseOptions = {
  log?: (msg: string) => void;
};

function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysAgoFromToday(today: string, days: number): string {
  return addDaysToDateString(today, -days);
}

function daysAgoDate(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

async function resolveDemoUser(
  prisma: PrismaClient,
): Promise<{ id: string } | null> {
  return prisma.user.findUnique({
    where: { email: DEMO_SHOWCASE_EMAIL },
    select: { id: true },
  });
}

async function resolveInstructorUser(
  prisma: PrismaClient,
): Promise<{ id: string } | null> {
  return prisma.user.findUnique({
    where: { email: INSTRUCTOR_SHOWCASE_EMAIL },
    select: { id: true },
  });
}

export function resolveDemoPassword(): string {
  return resolveLocalDevPassword();
}

async function seedDemoProfile(
  prisma: PrismaClient,
  userId: string,
): Promise<{ profileUpdated: boolean; credentialPasswordSet: boolean }> {
  const accountCreatedAt = daysAgoDate(VETERAN_ACCOUNT_AGE_DAYS);

  await prisma.user.update({
    where: { id: userId },
    data: {
      displayName: 'Hossam Ahmed',
      bio: 'Intermediate track · AI focus · daily problem solver since 2024',
      yearLevel: 2,
      emailVerified: true,
      githubLinked: true,
      githubAppInstalled: true,
      onboardingProgress: VETERAN_ONBOARDING_PROGRESS,
      createdAt: accountCreatedAt,
    },
  });

  const credentialPasswordSet = await seedCredentialPasswordForUser(
    prisma,
    userId,
  );

  await prisma.userSocialLink.upsert({
    where: { userId_platform: { userId, platform: SocialPlatform.linkedin } },
    create: {
      userId,
      platform: SocialPlatform.linkedin,
      value: 'https://linkedin.com/in/hossam-ahmed-demo',
    },
    update: { value: 'https://linkedin.com/in/hossam-ahmed-demo' },
  });

  await prisma.userSocialLink.upsert({
    where: { userId_platform: { userId, platform: SocialPlatform.website } },
    create: {
      userId,
      platform: SocialPlatform.website,
      value: 'https://github.com/demo-user',
    },
    update: { value: 'https://github.com/demo-user' },
  });

  return { profileUpdated: true, credentialPasswordSet };
}

async function seedDemoGithubAccount(
  prisma: PrismaClient,
  userId: string,
): Promise<boolean> {
  await prisma.githubAccount.upsert({
    where: { userId },
    update: {
      githubUserId: 'demo-user-id',
      login: 'demo-user',
      installationId: 'demo-installation',
    },
    create: {
      userId,
      githubUserId: 'demo-user-id',
      login: 'demo-user',
      installationId: 'demo-installation',
    },
  });

  const cs161Project = await prisma.project.findUnique({
    where: { slug: 'cs161/exam1' },
    select: { id: true },
  });
  if (cs161Project) {
    await prisma.userProjectRepo.upsert({
      where: {
        userId_projectId: { userId, projectId: cs161Project.id },
      },
      create: {
        userId,
        projectId: cs161Project.id,
        owner: 'demo-user',
        name: 'cs161-exam1',
        defaultBranch: 'main',
        cloneUrl: 'https://github.com/demo-user/cs161-exam1.git',
      },
      update: {
        owner: 'demo-user',
        name: 'cs161-exam1',
        cloneUrl: 'https://github.com/demo-user/cs161-exam1.git',
      },
    });
  }

  return true;
}

async function seedVeteranEnrollments(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  const coursesWithProjects = await prisma.course.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      OR: [
        { termLabel: { startsWith: 'Year 1' } },
        { termLabel: { startsWith: 'Year 2' } },
        { isPublic: true },
      ],
      projects: { some: { status: ProjectStatus.published } },
    },
    select: { id: true, termLabel: true },
    orderBy: { termLabel: 'asc' },
  });

  const year1EnrolledAt = daysAgoDate(VETERAN_ACCOUNT_AGE_DAYS);
  const year2EnrolledAt = daysAgoDate(120);
  const publicEnrolledAt = daysAgoDate(200);
  let count = 0;

  for (const course of coursesWithProjects) {
    const term = course.termLabel || '';
    const level = term.startsWith('Year 2')
      ? 2
      : term.startsWith('Year 1')
        ? 1
        : 2;
    const enrolledAt = term.startsWith('Year 1')
      ? year1EnrolledAt
      : term.startsWith('Year 2')
        ? year2EnrolledAt
        : publicEnrolledAt;

    await prisma.courseMembership.upsert({
      where: { courseId_userId: { courseId: course.id, userId } },
      create: {
        courseId: course.id,
        userId,
        role: CourseRole.student,
        level,
        createdAt: enrolledAt,
      },
      update: { role: CourseRole.student, level },
    });
    await prisma.courseMembership.update({
      where: { courseId_userId: { courseId: course.id, userId } },
      data: { createdAt: enrolledAt, level },
    });
    count += 1;
  }

  return count;
}

async function seedMilestoneDueDates(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  const memberships = await prisma.courseMembership.findMany({
    where: { userId, role: CourseRole.student },
    select: { courseId: true },
  });
  const courseIds = memberships.map((entry) => entry.courseId);
  if (courseIds.length === 0) return 0;

  const projects = await prisma.project.findMany({
    where: {
      courseId: { in: courseIds },
      status: ProjectStatus.published,
    },
    select: { id: true },
  });
  const projectIds = projects.map((project) => project.id);
  if (projectIds.length === 0) return 0;

  const milestones = await prisma.milestone.findMany({
    where: { projectId: { in: projectIds } },
    orderBy: [{ projectId: 'asc' }, { order: 'asc' }],
    select: { id: true },
  });

  let count = 0;
  for (const [index, milestone] of milestones.entries()) {
    const daysAhead = 7 + (index % 24);
    const dueAt = new Date(Date.now() + daysAhead * 86_400_000);
    await prisma.milestone.update({
      where: { id: milestone.id },
      data: { dueAt },
    });
    count += 1;
  }

  return count;
}

function mapRequirementGroups(
  groups: Array<
    Prisma.RequirementGroupGetPayload<{
      include: {
        rules: { include: { courses: true } };
      };
    }>
  >,
): RequirementGroupRecord[] {
  return groups.map((group) => ({
    id: group.id,
    programVersionId: group.programVersionId,
    trackId: group.trackId,
    title: group.title,
    category: group.category,
    minUnits: group.minUnits,
    minCourses: group.minCourses,
    notes: group.notes,
    sortOrder: group.sortOrder,
    noDoubleCount: group.noDoubleCount,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    rules: group.rules.map((rule) => ({
      id: rule.id,
      requirementGroupId: rule.requirementGroupId,
      ruleType: rule.ruleType,
      pickCount: rule.pickCount,
      note: rule.note,
      sortOrder: rule.sortOrder,
      courses: rule.courses.map((course) => ({
        id: course.id,
        requirementRuleId: course.requirementRuleId,
        catalogCourseId: course.catalogCourseId,
      })),
    })),
  }));
}

function mapCatalogCourses(
  courses: Array<{
    id: string;
    programId: string;
    subjectCode: string;
    catalogNumber: string;
    title: string;
    defaultUnits: number;
    department: string;
    plannerCode: string | null;
    trackingCourseId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
): CatalogCourseRecord[] {
  return courses.map((course) => ({
    id: course.id,
    programId: course.programId,
    subjectCode: course.subjectCode,
    catalogNumber: course.catalogNumber,
    title: course.title,
    defaultUnits: course.defaultUnits,
    department: course.department,
    plannerCode: course.plannerCode,
    trackingCourseId: course.trackingCourseId,
    prerequisiteIds: [],
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  }));
}

async function seedPlanner(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  const program = await prisma.program.findFirst({
    where: { slug: 'cs-program' },
    select: { id: true, activeVersionId: true },
  });
  if (!program?.activeVersionId) return 0;

  const version = await prisma.programVersion.findUnique({
    where: { id: program.activeVersionId },
    select: { id: true, durationYears: true },
  });
  if (!version) return 0;

  let studentProgram = await prisma.studentProgram.findFirst({
    where: { userId, programVersionId: version.id },
  });
  if (!studentProgram) {
    studentProgram = await prisma.studentProgram.create({
      data: { userId, programVersionId: version.id },
    });
  }

  const aiTrack = await prisma.track.findFirst({
    where: { programVersionId: version.id, slug: 'artificial-intelligence' },
    select: { id: true },
  });

  const catalogCourses = await prisma.catalogCourse.findMany({
    where: { programId: program.id },
    orderBy: [{ subjectCode: 'asc' }, { catalogNumber: 'asc' }],
  });

  const requirementGroups = await prisma.requirementGroup.findMany({
    where: { programVersionId: version.id },
    include: { rules: { include: { courses: true } } },
    orderBy: { sortOrder: 'asc' },
  });

  const mappedGroups = mapRequirementGroups(requirementGroups);
  const mappedCatalog = mapCatalogCourses(catalogCourses);

  const foundationPlan = buildRecommendedPlan({
    catalogCourses: mappedCatalog,
    requirementGroups: mappedGroups,
    selectedTrack: null,
    durationYears: version.durationYears,
  });

  const plannedIds = new Set(
    foundationPlan.map((entry) => entry.catalogCourseId),
  );
  const extraTerms: StoreAcademicTerm[] = ['fall', 'spring', 'summer'];
  const extendedPlan = [...foundationPlan];

  for (const course of catalogCourses) {
    if (plannedIds.has(course.id)) continue;
    if (extendedPlan.length >= 20) break;
    const slotIndex = extendedPlan.length;
    const year = Math.min(version.durationYears, Math.floor(slotIndex / 3) + 2);
    extendedPlan.push({
      catalogCourseId: course.id,
      plannedYear: year,
      plannedTerm: extraTerms[
        slotIndex % extraTerms.length
      ] as StoreAcademicTerm,
      sourceType: 'standard',
      note: null,
    });
    plannedIds.add(course.id);
  }

  await prisma.studentPlannedCourse.deleteMany({
    where: { studentProgramId: studentProgram.id },
  });

  if (extendedPlan.length > 0) {
    await prisma.studentPlannedCourse.createMany({
      data: extendedPlan.map((entry) => ({
        studentProgramId: studentProgram!.id,
        catalogCourseId: entry.catalogCourseId,
        plannedYear: entry.plannedYear,
        plannedTerm: entry.plannedTerm as AcademicTerm,
        sourceType: PlannedCourseSourceType.standard,
        note: entry.note,
      })),
    });
  }

  await prisma.studentProgram.update({
    where: { id: studentProgram.id },
    data: {
      selectedTrackId: aiTrack?.id ?? null,
      expectedGraduationQuarter: 'Spring 2028',
      suid: '00987654',
    },
  });

  return extendedPlan.length;
}

async function seedVeteranSubmissions(
  prisma: PrismaClient,
  userId: string,
  instructorId: string | null,
): Promise<number> {
  const yearCourses = await prisma.course.findMany({
    where: {
      isActive: true,
      OR: [
        { termLabel: { startsWith: 'Year 1' } },
        { termLabel: { startsWith: 'Year 2' } },
      ],
    },
    select: { id: true },
  });
  const courseIds = yearCourses.map((course) => course.id);

  const projects = await prisma.project.findMany({
    where: {
      status: ProjectStatus.published,
      courseId: courseIds.length > 0 ? { in: courseIds } : undefined,
    },
    include: {
      releases: { orderBy: { createdAt: 'desc' }, take: 1 },
      milestones: { orderBy: { order: 'asc' } },
    },
    take: 8,
    orderBy: { createdAt: 'asc' },
  });

  if (projects.length === 0) {
    const fallback = await prisma.project.findUnique({
      where: { slug: 'cs161/exam1' },
      include: {
        releases: { orderBy: { createdAt: 'desc' }, take: 1 },
        milestones: { orderBy: { order: 'asc' } },
      },
    });
    if (fallback) projects.push(fallback);
  }

  let count = 0;
  const repoSlug = (slug: string) => slug.replace(/\//g, '-');

  for (const [projectIndex, project] of projects.entries()) {
    const release = project.releases[0];
    if (!release) continue;

    const milestones = project.milestones;
    const milestone1 = milestones[0]?.id ?? null;
    const milestone2 = milestones[1]?.id ?? milestone1;
    const repoName = repoSlug(project.slug);

    const submissionSpecs: Array<{
      sha: string;
      status: SubmissionStatus;
      milestoneId: string | null;
      summary: string;
      daysAgo: number;
      review?: { status: ReviewStatus; score: number };
    }> = [];

    const baseDaysAgo =
      VETERAN_ACCOUNT_AGE_DAYS - 20 - projectIndex * Math.floor(30);

    for (let i = 0; i < 3; i += 1) {
      const daysAgo = Math.max(3, baseDaysAgo - i * 12);
      const isRecent = projectIndex === 0 && i === 0;
      submissionSpecs.push({
        sha: `demo-veteran-${repoName}-${i}`,
        status: isRecent
          ? SubmissionStatus.needs_review
          : SubmissionStatus.passed,
        milestoneId: i === 0 ? milestone1 : milestone2,
        summary: isRecent
          ? 'Latest milestone submitted for instructor review.'
          : `Milestone ${i + 1} passed automated verification.`,
        daysAgo: isRecent ? 1 : daysAgo,
        review:
          isRecent || !instructorId
            ? undefined
            : {
                status:
                  i === 0 ? ReviewStatus.graded : ReviewStatus.approved,
                score: 85 + ((projectIndex + i) % 14),
              },
      });
    }

    for (const spec of submissionSpecs) {
      const createdAt = daysAgoDate(spec.daysAgo);
      const submission = await prisma.submissionAttempt.upsert({
        where: {
          userId_projectId_commitSha: {
            userId,
            projectId: project.id,
            commitSha: spec.sha,
          },
        },
        create: {
          userId,
          projectId: project.id,
          projectReleaseId: release.id,
          milestoneId: spec.milestoneId,
          commitSha: spec.sha,
          repoUrl: `https://github.com/demo-user/${repoName}`,
          branch: 'main',
          status: spec.status,
          summary: spec.summary,
          submittedAt: createdAt,
          createdAt,
          updatedAt: createdAt,
        },
        update: {
          status: spec.status,
          summary: spec.summary,
          milestoneId: spec.milestoneId,
          submittedAt: createdAt,
        },
      });
      count += 1;

      if (spec.review && instructorId) {
        const reviewedAt = new Date(createdAt.getTime() + 86_400_000);
        const existingReview = await prisma.review.findFirst({
          where: { submissionAttemptId: submission.id },
          select: { id: true },
        });
        if (existingReview) {
          await prisma.review.update({
            where: { id: existingReview.id },
            data: {
              status: spec.review.status,
              score: spec.review.score,
              feedback: 'Strong work — clear structure and thorough testing.',
              reviewedAt,
            },
          });
        } else {
          await prisma.review.create({
            data: {
              submissionAttemptId: submission.id,
              reviewerUserId: instructorId,
              status: spec.review.status,
              score: spec.review.score,
              feedback: 'Strong work — clear structure and thorough testing.',
              reviewedAt,
            },
          });
        }
      }
    }
  }

  return count;
}

async function seedVideoProgress(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  const year1Courses = await prisma.course.findMany({
    where: { isActive: true, termLabel: { startsWith: 'Year 1' } },
    select: { id: true },
  });
  if (year1Courses.length === 0) return 0;

  const videos = await prisma.courseVideo.findMany({
    where: {
      section: { courseId: { in: year1Courses.map((course) => course.id) } },
    },
    select: { id: true },
  });

  let count = 0;
  for (const [index, video] of videos.entries()) {
    const watchedProgress = 0.82 + (index % 5) * 0.035;
    await prisma.videoProgress.upsert({
      where: { userId_videoId: { userId, videoId: video.id } },
      create: {
        userId,
        videoId: video.id,
        watched: watchedProgress >= 0.9,
        watchedProgress: Math.min(1, watchedProgress),
      },
      update: {
        watched: watchedProgress >= 0.9,
        watchedProgress: Math.min(1, watchedProgress),
      },
    });
    count += 1;
  }

  return count;
}

async function seedAssignmentSubmissions(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  const assignments = await prisma.courseAssignment.findMany({
    where: { published: true },
    orderBy: { createdAt: 'asc' },
    take: 6,
    select: { id: true, title: true },
  });
  if (assignments.length === 0) return 0;

  const submissionDaysAgo = [320, 260, 180, 90, 14, 2];
  let count = 0;

  for (const [index, assignment] of assignments.entries()) {
    const daysAgo = submissionDaysAgo[index] ?? 30 + index * 10;
    const submittedAt = daysAgoDate(daysAgo);
    const isLatest = index === assignments.length - 1;
    const isGraded = index < assignments.length - 1;

    await prisma.assignmentSubmission.upsert({
      where: { assignmentId_userId: { assignmentId: assignment.id, userId } },
      create: {
        assignmentId: assignment.id,
        userId,
        content: isLatest
          ? 'Submitted quiz responses — awaiting grading.'
          : `Completed ${assignment.title}. Applied concepts from lectures and practice problems.`,
        status: isGraded
          ? AssignmentSubmissionStatus.graded
          : AssignmentSubmissionStatus.submitted,
        score: isGraded ? 88 + (index % 10) : null,
        feedback: isGraded
          ? 'Solid work with clear reasoning throughout.'
          : null,
        submittedAt,
      },
      update: {
        status: isGraded
          ? AssignmentSubmissionStatus.graded
          : AssignmentSubmissionStatus.submitted,
        score: isGraded ? 88 + (index % 10) : null,
        feedback: isGraded
          ? 'Solid work with clear reasoning throughout.'
          : null,
        submittedAt,
      },
    });
    count += 1;
  }

  return count;
}

async function ensureLeetcodeProblems(
  prisma: PrismaClient,
): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();
  for (const entry of NIBRAS_75_CURRICULUM) {
    const problem = await prisma.problem.upsert({
      where: {
        platform_platformProblemId: {
          platform: 'leetcode',
          platformProblemId: entry.slug,
        },
      },
      create: {
        platform: 'leetcode',
        platformProblemId: entry.slug,
        title: entry.title,
        url: `https://leetcode.com/problems/${entry.slug}/`,
        difficulty: LEETCODE_DIFFICULTY[entry.difficulty] ?? 1500,
        tags: entry.tags,
      },
      update: {
        title: entry.title,
        url: `https://leetcode.com/problems/${entry.slug}/`,
        difficulty: LEETCODE_DIFFICULTY[entry.difficulty] ?? 1500,
        tags: entry.tags,
      },
      select: { id: true, platformProblemId: true },
    });
    idBySlug.set(problem.platformProblemId, problem.id);
  }
  return idBySlug;
}

async function seedDailyProblem(
  prisma: PrismaClient,
  userId: string,
  problemIds: string[],
): Promise<number> {
  const today = getUserToday(DEMO_TIMEZONE);
  const streakLength = VETERAN_STREAK;
  const totalCompleted = VETERAN_DAILY_TOTAL;

  const config = await prisma.dailyProblemConfig.upsert({
    where: { userId },
    create: {
      userId,
      timezone: DEMO_TIMEZONE,
      currentStreak: streakLength,
      longestStreak: streakLength,
      totalCompleted,
      lastCompletedDate: today,
      streakFreezes: 2,
      difficultyPref: [800, 1500],
      tagPrefs: ['array', 'dynamic-programming', 'graph'],
    },
    update: {
      timezone: DEMO_TIMEZONE,
      currentStreak: streakLength,
      longestStreak: streakLength,
      totalCompleted,
      lastCompletedDate: today,
      streakFreezes: 2,
    },
  });

  await prisma.dailyProblemAssignment.deleteMany({ where: { userId } });

  const assignments: Prisma.DailyProblemAssignmentCreateManyInput[] = [];
  const problemPool =
    problemIds.length > 0 ? problemIds : [problemIds[0]].filter(Boolean);
  if (problemPool.length === 0) return 0;

  for (let offset = DAILY_HISTORY_DAYS; offset >= 0; offset -= 1) {
    const assignedDate = daysAgoFromToday(today, offset);
    const daysFromToday = offset;
    const problemId = problemPool[(DAILY_HISTORY_DAYS - offset) % problemPool.length]!;
    const inStreakWindow = daysFromToday < streakLength;
    const solved = inStreakWindow && daysFromToday > 0;
    const skipped =
      !inStreakWindow &&
      daysFromToday > streakLength &&
      daysFromToday % 11 === 0;

    assignments.push({
      userId,
      problemId,
      configId: config.id,
      assignedDate,
      solved,
      skipped,
      solvedAt: solved ? new Date(`${assignedDate}T18:00:00Z`) : null,
    });
  }

  await prisma.dailyProblemAssignment.createMany({ data: assignments });
  return assignments.length;
}

async function seedNibras75Progress(
  prisma: PrismaClient,
  userId: string,
  problemIdBySlug: Map<string, string>,
): Promise<number> {
  const targetDate = new Date(Date.now() + 42 * 86_400_000);
  await prisma.nibras75Config.upsert({
    where: { userId },
    create: {
      userId,
      weeklyPace: 6,
      targetDate,
      useForDailyProblem: false,
    },
    update: {
      weeklyPace: 6,
      targetDate,
    },
  });

  const solveCount = VETERAN_NIBRAS75_SOLVES;
  let count = 0;
  for (
    let i = 0;
    i < Math.min(solveCount, NIBRAS_75_CURRICULUM.length);
    i += 1
  ) {
    const entry = NIBRAS_75_CURRICULUM[i]!;
    const problemId = problemIdBySlug.get(entry.slug);
    if (!problemId) continue;
    const daysAgo = DAILY_HISTORY_DAYS - Math.floor((i / solveCount) * (DAILY_HISTORY_DAYS - 7));
    const solvedAt = daysAgoDate(daysAgo);
    await prisma.userProblemProgress.upsert({
      where: { userId_problemId: { userId, problemId } },
      create: { userId, problemId, solved: true, solvedAt },
      update: { solved: true, solvedAt },
    });
    count += 1;
  }
  return count;
}

async function seedCpRoadmapProgress(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  const topics = await prisma.cpRoadmapTopic.findMany({
    take: VETERAN_CP_TOPICS,
    orderBy: { sortOrder: 'asc' },
    include: {
      topicProblems: {
        take: VETERAN_CP_PROBLEMS_PER_TOPIC,
        orderBy: { sortOrder: 'asc' },
        include: { problem: { select: { slug: true } } },
      },
    },
  });

  let count = 0;
  for (const topic of topics) {
    for (const link of topic.topicProblems) {
      const slug = link.problem.slug;
      const daysAgo = DAILY_HISTORY_DAYS - Math.floor((count / (VETERAN_CP_TOPICS * VETERAN_CP_PROBLEMS_PER_TOPIC)) * (DAILY_HISTORY_DAYS - 14));
      const solvedAt = daysAgoDate(Math.max(7, daysAgo));
      await prisma.cpRoadmapProblemProgress.upsert({
        where: { userId_roadmapProblemId: { userId, roadmapProblemId: slug } },
        create: {
          userId,
          roadmapProblemId: slug,
          solved: true,
          solvedAt,
          userMarked: count % 3 === 0,
        },
        update: { solved: true, solvedAt, userMarked: count % 3 === 0 },
      });
      count += 1;
    }
  }
  return count;
}

async function seedGamification(
  prisma: PrismaClient,
  userId: string,
): Promise<{ badgesAwarded: number; reputationEvents: number }> {
  const badges = await prisma.badgeDefinition.findMany({
    where: { code: { in: [...SHOWCASE_BADGE_CODES] } },
    select: { id: true, code: true, points: true },
  });

  let badgesAwarded = 0;
  for (const [index, badge] of badges.entries()) {
    await prisma.userBadge.upsert({
      where: { userId_badgeId: { userId, badgeId: badge.id } },
      create: {
        userId,
        badgeId: badge.id,
        earnedAt: daysAgoDate(
          VETERAN_ACCOUNT_AGE_DAYS - index * Math.floor(VETERAN_ACCOUNT_AGE_DAYS / Math.max(badges.length, 1)),
        ),
      },
      update: {},
    });
    badgesAwarded += 1;
  }

  const reputationSpecs = [
    {
      source: `${DEMO_SHOWCASE_MARKER}:streak`,
      reason: `Maintained a ${VETERAN_STREAK}-day daily problem streak`,
      delta: 50,
      category: 'problem' as const,
      daysAgo: 14,
    },
    {
      source: `${DEMO_SHOWCASE_MARKER}:submission`,
      reason: 'Passed multiple project milestones across Year 1 and Year 2',
      delta: 75,
      category: 'course' as const,
      daysAgo: 90,
    },
    {
      source: `${DEMO_SHOWCASE_MARKER}:community`,
      reason: 'Helpful replies in course discussions over the past year',
      delta: 25,
      category: 'community' as const,
      daysAgo: 160,
    },
    {
      source: `${DEMO_SHOWCASE_MARKER}:badge`,
      reason: 'Earned GitHub Connected badge',
      delta: 25,
      category: 'badge' as const,
      daysAgo: 380,
    },
    {
      source: `${DEMO_SHOWCASE_MARKER}:nibras75`,
      reason: `Solved ${VETERAN_NIBRAS75_SOLVES} Nibras 75 problems`,
      delta: 100,
      category: 'problem' as const,
      daysAgo: 45,
    },
    {
      source: `${DEMO_SHOWCASE_MARKER}:cp-roadmap`,
      reason: 'Steady progress on CP Roadmap curriculum',
      delta: 50,
      category: 'problem' as const,
      daysAgo: 120,
    },
    {
      source: `${DEMO_SHOWCASE_MARKER}:year1-complete`,
      reason: 'Completed Year 1 foundation courses',
      delta: 80,
      category: 'course' as const,
      daysAgo: 200,
    },
    {
      source: `${DEMO_SHOWCASE_MARKER}:daily-milestone`,
      reason: `Reached ${VETERAN_DAILY_TOTAL} daily problems solved`,
      delta: 60,
      category: 'problem' as const,
      daysAgo: 30,
    },
  ];

  let reputationEvents = 0;
  for (const spec of reputationSpecs) {
    await prisma.reputationEvent.upsert({
      where: { userId_source: { userId, source: spec.source } },
      create: {
        userId,
        source: spec.source,
        reason: spec.reason,
        delta: spec.delta,
        category: spec.category,
        createdAt: daysAgoDate(spec.daysAgo),
      },
      update: {
        reason: spec.reason,
        delta: spec.delta,
        category: spec.category,
        createdAt: daysAgoDate(spec.daysAgo),
      },
    });
    reputationEvents += 1;
  }

  await recomputeUserGamificationMetrics(prisma, userId).catch(() => {
    // Metrics table may be absent on older DBs — badge/reputation rows still seed fine.
  });
  return { badgesAwarded, reputationEvents };
}

async function seedCommunityEngagement(
  prisma: PrismaClient,
  userId: string,
): Promise<{ communityPosts: number; communityVotes: number }> {
  await prisma.communityPost.deleteMany({
    where: { authorId: userId, body: { contains: DEMO_SHOWCASE_MARKER } },
  });

  const threads = await prisma.communityThread.findMany({
    where: { closed: false },
    orderBy: { lastActivityAt: 'desc' },
    take: 6,
    select: { id: true, title: true, postsCount: true },
  });

  const postBodies = [
    'Great question! I found the lecture notes on amortized analysis really helpful for this.',
    'We formed a study group for this — happy to share our notes in the course hub.',
    'Confirming the approach from office hours: start with the base case, then build up inductively.',
    'After a year on Nibras, the daily problem streak really helped me stay sharp between courses.',
    'For anyone starting the AI track: finish the Year 1 graph unit before jumping into heuristics.',
    'Linked my GitHub early — made project submissions much smoother for every milestone.',
  ];
  const postDaysAgo = [350, 280, 210, 140, 70, 21];

  let communityPosts = 0;
  for (const [index, thread] of threads.entries()) {
    const body = [
      DEMO_SHOWCASE_POST_MARKER,
      '',
      postBodies[index] ?? postBodies[postBodies.length - 1]!,
    ].join('\n');
    const createdAt = daysAgoDate(postDaysAgo[index] ?? 30 + index * 14);

    await prisma.communityPost.create({
      data: {
        threadId: thread.id,
        authorId: userId,
        body,
        createdAt,
        updatedAt: createdAt,
      },
    });

    await prisma.communityThread.update({
      where: { id: thread.id },
      data: {
        postsCount: { increment: 1 },
        lastActivityAt: createdAt,
        updatedAt: createdAt,
      },
    });
    communityPosts += 1;
  }

  const questions = await prisma.communityQuestion.findMany({
    orderBy: { createdAt: 'desc' },
    take: 2,
    select: { id: true, votesCount: true },
  });

  let communityVotes = 0;
  for (const question of questions) {
    const existing = await prisma.communityVote.findUnique({
      where: {
        userId_targetType_targetId: {
          userId,
          targetType: CommunityVoteTargetType.question,
          targetId: question.id,
        },
      },
    });
    if (!existing) {
      await prisma.communityVote.create({
        data: {
          userId,
          targetType: CommunityVoteTargetType.question,
          targetId: question.id,
          value: 1,
        },
      });
      await prisma.communityQuestion.update({
        where: { id: question.id },
        data: { votesCount: { increment: 1 } },
      });
      communityVotes += 1;
    }
  }

  const answer = await prisma.communityAnswer.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, votesCount: true },
  });
  if (answer) {
    const existing = await prisma.communityVote.findUnique({
      where: {
        userId_targetType_targetId: {
          userId,
          targetType: CommunityVoteTargetType.answer,
          targetId: answer.id,
        },
      },
    });
    if (!existing) {
      await prisma.communityVote.create({
        data: {
          userId,
          targetType: CommunityVoteTargetType.answer,
          targetId: answer.id,
          value: 1,
        },
      });
      await prisma.communityAnswer.update({
        where: { id: answer.id },
        data: { votesCount: { increment: 1 } },
      });
      communityVotes += 1;
    }
  }

  return { communityPosts, communityVotes };
}

export async function seedDemoShowcaseData(
  prisma: PrismaClient,
  options?: DemoShowcaseOptions,
): Promise<DemoShowcaseResult> {
  const log = options?.log ?? (() => {});

  const demoUser = await resolveDemoUser(prisma);
  if (!demoUser) {
    log(`⏭ Demo showcase skipped — ${DEMO_SHOWCASE_EMAIL} not found`);
    return {
      skipped: true,
      reason: 'demo user not found',
      profileUpdated: false,
      credentialPasswordSet: false,
      githubLinked: false,
      enrollments: 0,
      plannedCourses: 0,
      submissions: 0,
      assignmentSubmissions: 0,
      videoProgress: 0,
      dailyAssignments: 0,
      nibras75Progress: 0,
      cpRoadmapProgress: 0,
      badgesAwarded: 0,
      communityPosts: 0,
      communityVotes: 0,
      reputationEvents: 0,
    };
  }

  const instructor = await resolveInstructorUser(prisma);

  log(`🎬 Seeding demo showcase for ${DEMO_SHOWCASE_EMAIL}…`);

  await seedLocalDevCredentials(prisma, { log });

  const { profileUpdated, credentialPasswordSet } = await seedDemoProfile(
    prisma,
    demoUser.id,
  );
  if (credentialPasswordSet) {
    log(
      `  → demo credential password set (${resolveDemoPassword() === DEFAULT_LOCAL_DEV_PASSWORD ? 'default local123' : 'from NIBRAS_DEMO_PASSWORD'})`,
    );
  }

  const githubLinked = await seedDemoGithubAccount(prisma, demoUser.id);
  if (githubLinked) {
    log('  → GitHub account linked (demo-user)');
  }

  const enrollments = await seedVeteranEnrollments(prisma, demoUser.id);
  log(`  → ${enrollments} course enrollment(s)`);

  const plannedCourses = await seedPlanner(prisma, demoUser.id);
  log(`  → ${plannedCourses} planned course(s)`);

  const submissions = await seedVeteranSubmissions(
    prisma,
    demoUser.id,
    instructor?.id ?? null,
  );
  log(`  → ${submissions} submission(s)`);

  const milestoneDueDates = await seedMilestoneDueDates(prisma, demoUser.id);
  log(`  → ${milestoneDueDates} milestone due date(s)`);

  const videoProgress = await seedVideoProgress(prisma, demoUser.id);
  log(`  → ${videoProgress} video progress row(s)`);

  const assignmentSubmissions = await seedAssignmentSubmissions(
    prisma,
    demoUser.id,
  );
  log(`  → ${assignmentSubmissions} assignment submission(s)`);

  const problemIdBySlug = await ensureLeetcodeProblems(prisma);
  const problemIds = [...problemIdBySlug.values()];

  const dailyAssignments = await seedDailyProblem(
    prisma,
    demoUser.id,
    problemIds,
  );
  log(`  → ${dailyAssignments} daily assignment(s)`);

  const nibras75Progress = await seedNibras75Progress(
    prisma,
    demoUser.id,
    problemIdBySlug,
  );
  log(`  → ${nibras75Progress} Nibras 75 progress row(s)`);

  const cpRoadmapProgress = await seedCpRoadmapProgress(prisma, demoUser.id);
  log(`  → ${cpRoadmapProgress} CP Roadmap progress row(s)`);

  const { badgesAwarded, reputationEvents } = await seedGamification(
    prisma,
    demoUser.id,
  );
  log(`  → ${badgesAwarded} badge(s), ${reputationEvents} reputation event(s)`);

  const { communityPosts, communityVotes } = await seedCommunityEngagement(
    prisma,
    demoUser.id,
  );
  log(`  → ${communityPosts} community post(s), ${communityVotes} vote(s)`);

  // Re-apply profile last so concurrent API store seeds cannot leave a stale display name.
  await seedDemoProfile(prisma, demoUser.id);

  await invalidateUserDashboardCache(demoUser.id).catch(() => {});

  log('✅ Demo showcase seed complete');

  return {
    skipped: false,
    profileUpdated,
    credentialPasswordSet,
    githubLinked,
    enrollments,
    plannedCourses,
    submissions,
    assignmentSubmissions,
    videoProgress,
    dailyAssignments,
    nibras75Progress,
    cpRoadmapProgress,
    badgesAwarded,
    communityPosts,
    communityVotes,
    reputationEvents,
  };
}
