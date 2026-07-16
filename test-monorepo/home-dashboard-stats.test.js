const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildStudentHomeDashboard,
} = require('../apps/api/dist/features/tracking/home-dashboard');

test('home dashboard derives milestone stats from submissions when statsByProject is empty', () => {
  const result = buildStudentHomeDashboard({
    user: {
      id: 'user_demo',
      username: 'demo',
      email: 'demo@nibras.dev',
      githubLinked: true,
      githubAppInstalled: true,
      systemRole: 'user',
      yearLevel: 2,
    },
    courses: [{ id: 'course_cs161', title: 'CS161', slug: 'cs161' }],
    snapshots: [
      {
        course: { id: 'course_cs161', title: 'CS161', slug: 'cs161' },
        projects: [
          {
            id: 'project_cs161_exam1',
            title: 'Exam 1',
            courseId: 'course_cs161',
            slug: 'cs161/exam1',
          },
        ],
        milestonesByProject: {
          project_cs161_exam1: [
            {
              id: 'milestone_exam1_design',
              title: 'Design',
              dueAt: '2099-06-01T00:00:00.000Z',
              projectId: 'project_cs161_exam1',
              order: 1,
            },
            {
              id: 'milestone_exam1_final',
              title: 'Final',
              dueAt: '2099-07-01T00:00:00.000Z',
              projectId: 'project_cs161_exam1',
              order: 2,
            },
          ],
        },
        statsByProject: {},
        memberships: [],
        activity: [],
        activeProjectId: 'project_cs161_exam1',
        pageError: null,
      },
    ],
    submissions: [
      {
        id: 'submission_passed',
        userId: 'user_demo',
        projectId: 'project_cs161_exam1',
        projectKey: 'cs161/exam1',
        milestoneId: 'milestone_exam1_design',
        status: 'passed',
        createdAt: '2026-01-01T00:00:00.000Z',
        submittedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'submission_review',
        userId: 'user_demo',
        projectId: 'project_cs161_exam1',
        projectKey: 'cs161/exam1',
        milestoneId: 'milestone_exam1_final',
        status: 'needs_review',
        createdAt: '2026-02-01T00:00:00.000Z',
        submittedAt: '2026-02-01T00:00:00.000Z',
      },
    ],
    reviewsBySubmission: {
      submission_passed: {
        id: 'review_passed',
        submissionId: 'submission_passed',
        status: 'graded',
        score: 92,
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      submission_review: null,
    },
  });

  assert.equal(result.overallStats.milestonesTotal, 2);
  assert.equal(result.overallStats.milestonesApproved, 1);
  assert.ok(result.overallStats.overallCompletionPercent > 0);
  assert.equal(result.courseSnapshots.length, 1);
  assert.equal(result.courseSnapshots[0].approved, 1);
  assert.equal(result.courseSnapshots[0].underReview, 1);
  assert.ok((result.upcomingDeadlines || []).length > 0);
});
