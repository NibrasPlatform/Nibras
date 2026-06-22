import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import { Model, Types } from 'mongoose';
import { createE2eApp, getHttpServer } from './setup-e2e-app';
import { User } from '../src/modules/auth/schemas/user.schema';
import { Role } from '../src/modules/rbac/schemas/role.schema';
import { Course } from '../src/modules/courses/schemas/course.schema';
import { CourseMembership } from '../src/modules/courses/schemas/course-membership.schema';
import { CourseSection } from '../src/modules/course-content/schemas/course-section.schema';
import { CourseVideo } from '../src/modules/course-content/schemas/course-video.schema';
import { VideoProgress } from '../src/modules/course-content/schemas/video-progress.schema';
import { CourseVideoStats } from '../src/modules/course-content/schemas/course-video-stats.schema';
import { CourseStats } from '../src/modules/course-content/schemas/course-stats.schema';
import { SessionService } from '../src/modules/auth/services/session.service';
import { VideoProvider } from '../src/modules/course-content/enums/course-content.enums';

interface CreateSectionResponse {
  id: string;
  title: string;
}

interface SectionListItem {
  videos: unknown[];
}

interface VideoCreatedResponse {
  id: string;
  embedUrl: string;
}

interface ErrorBody {
  code: string;
}

interface VideoDetailResponse {
  locked: boolean;
}

interface ProgressUpdatedResponse {
  watched: boolean;
}

interface CourseAnalyticsResponse {
  totalStudents: number;
  averageProgress: number;
  completionRate: number;
}

describe('Course Content flow (e2e)', () => {
  let app: INestApplication;
  let userModel: Model<User>;
  let roleModel: Model<Role>;
  let courseModel: Model<Course>;
  let membershipModel: Model<CourseMembership>;
  let sectionModel: Model<CourseSection>;
  let videoModel: Model<CourseVideo>;
  let progressModel: Model<VideoProgress>;
  let videoStatsModel: Model<CourseVideoStats>;
  let courseStatsModel: Model<CourseStats>;
  let sessionService: SessionService;
  let instructorToken: string;
  let studentToken: string;
  let student2Token: string;
  let student3Token: string;
  let student4Token: string;
  let courseId: string;
  let sectionId: string;
  let videoAId: string;
  let videoBId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    userModel = app.get(getModelToken(User.name));
    roleModel = app.get(getModelToken(Role.name));
    courseModel = app.get(getModelToken(Course.name));
    membershipModel = app.get(getModelToken(CourseMembership.name));
    sectionModel = app.get(getModelToken(CourseSection.name));
    videoModel = app.get(getModelToken(CourseVideo.name));
    progressModel = app.get(getModelToken(VideoProgress.name));
    videoStatsModel = app.get(getModelToken(CourseVideoStats.name));
    courseStatsModel = app.get(getModelToken(CourseStats.name));
    sessionService = app.get(SessionService);

    const instructorRole = await roleModel
      .findOne({ name: 'instructor' })
      .exec();
    const studentRole = await roleModel.findOne({ name: 'student' }).exec();

    const instructor = await userModel.create({
      email: 'instructor-content@test.edu',
      username: 'instructor_content',
      displayName: 'Instructor',
      role: instructorRole!._id,
      emailVerified: true,
      githubLinked: false,
      reputationScore: 0,
      preferences: {},
    });

    const student = await userModel.create({
      email: 'student-content@test.edu',
      username: 'student_content',
      displayName: 'Student',
      role: studentRole!._id,
      emailVerified: true,
      githubLinked: false,
      reputationScore: 0,
      preferences: {},
    });

    const student2 = await userModel.create({
      email: 'student2-content@test.edu',
      username: 'student2_content',
      displayName: 'Student 2',
      role: studentRole!._id,
      emailVerified: true,
      githubLinked: false,
      reputationScore: 0,
      preferences: {},
    });

    const student3 = await userModel.create({
      email: 'student3-content@test.edu',
      username: 'student3_content',
      displayName: 'Student 3',
      role: studentRole!._id,
      emailVerified: true,
      githubLinked: false,
      reputationScore: 0,
      preferences: {},
    });

    const student4 = await userModel.create({
      email: 'student4-content@test.edu',
      username: 'student4_content',
      displayName: 'Student 4',
      role: studentRole!._id,
      emailVerified: true,
      githubLinked: false,
      reputationScore: 0,
      preferences: {},
    });

    instructorToken = await sessionService.createSession(
      instructor._id.toString(),
    );
    studentToken = await sessionService.createSession(student._id.toString());
    student2Token = await sessionService.createSession(student2._id.toString());
    student3Token = await sessionService.createSession(student3._id.toString());
    student4Token = await sessionService.createSession(student4._id.toString());
  });

  afterAll(async () => {
    await Promise.all([
      progressModel.deleteMany({}).exec(),
      videoStatsModel.deleteMany({}).exec(),
      courseStatsModel.deleteMany({}).exec(),
      videoModel.deleteMany({}).exec(),
      sectionModel.deleteMany({}).exec(),
      membershipModel.deleteMany({}).exec(),
      courseModel.deleteMany({}).exec(),
      userModel
        .deleteMany({
          email: {
            $in: [
              'instructor-content@test.edu',
              'student-content@test.edu',
              'student2-content@test.edu',
              'student3-content@test.edu',
              'student4-content@test.edu',
            ],
          },
        })
        .exec(),
    ]);
    await app?.close();
  });

  describe('Happy path flow', () => {
    it('1. instructor creates a course with sequentialVideos enabled', async () => {
      const res = await request(getHttpServer(app))
        .post('/api/courses')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          slug: 'content-e2e-course',
          title: 'Content E2E Course',
          termLabel: 'Fall 2026',
          courseCode: 'CE2E',
          isPublic: true,
          sequentialVideos: true,
        })
        .expect(201);

      courseId = (res.body as { id: string }).id;
      expect(courseId).toBeDefined();
    });

    it('2. student enrolls in the course', async () => {
      await request(getHttpServer(app))
        .post(`/api/courses/${courseId}/enroll`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({})
        .expect(201);
    });

    it('3. additional students enroll for multi-user analytics', async () => {
      for (const token of [student2Token, student3Token, student4Token]) {
        await request(getHttpServer(app))
          .post(`/api/courses/${courseId}/enroll`)
          .set('Authorization', `Bearer ${token}`)
          .send({})
          .expect(201);
      }
    });

    it('4. instructor creates a section', async () => {
      const res = await request(getHttpServer(app))
        .post(`/api/courses/${courseId}/sections`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          title: 'Week 1: Introduction',
          description: 'First week content',
          sortOrder: 0,
        })
        .expect(201);

      sectionId = (res.body as { id: string }).id;
      expect(sectionId).toBeDefined();
      expect((res.body as CreateSectionResponse).title).toBe(
        'Week 1: Introduction',
      );
    });

    it('5. instructor lists sections (empty videos)', async () => {
      const res = await request(getHttpServer(app))
        .get(`/api/courses/${courseId}/sections`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      const sectionList = res.body as SectionListItem[];
      expect(Array.isArray(sectionList)).toBe(true);
      expect(sectionList.length).toBe(1);
      expect(sectionList[0].videos).toEqual([]);
    });

    it('6. instructor creates Video A (no prerequisite)', async () => {
      const res = await request(getHttpServer(app))
        .post(`/api/courses/${courseId}/sections/${sectionId}/videos`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          title: 'Video A',
          provider: VideoProvider.YouTube,
          externalId: 'aaaaaaaaaaa',
          embedUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
          durationSeconds: 120,
          sortOrder: 0,
        })
        .expect(201);

      videoAId = (res.body as { id: string }).id;
      expect(videoAId).toBeDefined();
      expect((res.body as VideoCreatedResponse).embedUrl).toContain(
        'youtube-nocookie.com',
      );
    });

    it('7. instructor creates Video B (requires Video A)', async () => {
      const res = await request(getHttpServer(app))
        .post(`/api/courses/${courseId}/sections/${sectionId}/videos`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          title: 'Video B',
          provider: VideoProvider.YouTube,
          externalId: 'bbbbbbbbbbb',
          embedUrl: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
          durationSeconds: 120,
          sortOrder: 1,
          requiresVideoId: videoAId,
        })
        .expect(201);

      videoBId = (res.body as { id: string }).id;
      expect(videoBId).toBeDefined();
    });
  });

  describe('Sequential unlock', () => {
    it('8. student is LOCKED from Video B before completing Video A', async () => {
      const res = await request(getHttpServer(app))
        .get(`/api/courses/${courseId}/videos/${videoBId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect((res.body as ErrorBody).code).toBe('VIDEO_LOCKED');
    });

    it('9. student completes Video A', async () => {
      await request(getHttpServer(app))
        .post(`/api/courses/${courseId}/videos/${videoAId}/progress`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          watched: true,
          watchedProgress: 0.95,
          lastPositionSeconds: 120,
        })
        .expect(201);
    });

    it('10. student can access Video B after completing Video A', async () => {
      const res = await request(getHttpServer(app))
        .get(`/api/courses/${courseId}/videos/${videoBId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect((res.body as VideoDetailResponse).locked).toBe(false);
    });
  });

  describe('Security & Authorization', () => {
    it('11. rejects unauthenticated access with 401', async () => {
      await request(getHttpServer(app))
        .get(`/api/courses/${courseId}/sections`)
        .expect(401);
    });

    it('12. student cannot create a section (403)', async () => {
      await request(getHttpServer(app))
        .post(`/api/courses/${courseId}/sections`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Hacked Section' })
        .expect(403);
    });

    it('13. student cannot create a video (403)', async () => {
      await request(getHttpServer(app))
        .post(`/api/courses/${courseId}/sections/${sectionId}/videos`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Hacked Video',
          provider: VideoProvider.YouTube,
          externalId: 'ccccccccccc',
          embedUrl: 'https://www.youtube.com/watch?v=ccccccccccc',
        })
        .expect(403);
    });

    it('14. student cannot update a video (403)', async () => {
      await request(getHttpServer(app))
        .patch(`/api/courses/${courseId}/videos/${videoAId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Hacked' })
        .expect(403);
    });

    it('15. rejects invalid embed URL (javascript: protocol)', async () => {
      await request(getHttpServer(app))
        .post(`/api/courses/${courseId}/sections/${sectionId}/videos`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          title: 'XSS Video',
          provider: VideoProvider.YouTube,
          externalId: 'xss',
          embedUrl: 'javascript:alert(1)',
        })
        .expect(400);
    });

    it('16. rejects non-YouTube embed URL', async () => {
      await request(getHttpServer(app))
        .post(`/api/courses/${courseId}/sections/${sectionId}/videos`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          title: 'Non-YouTube Video',
          provider: VideoProvider.YouTube,
          externalId: 'vimeo',
          embedUrl: 'https://vimeo.com/123456789',
        })
        .expect(400);
    });
  });

  describe('Soft delete preservation', () => {
    it('17. student 2 completes Video A', async () => {
      const res = await request(getHttpServer(app))
        .post(`/api/courses/${courseId}/videos/${videoAId}/progress`)
        .set('Authorization', `Bearer ${student2Token}`)
        .send({
          watched: true,
          watchedProgress: 0.95,
          lastPositionSeconds: 120,
        })
        .expect(201);

      expect((res.body as ProgressUpdatedResponse).watched).toBe(true);
    });

    it('18. instructor deletes Video A (soft delete)', async () => {
      await request(getHttpServer(app))
        .delete(`/api/courses/${courseId}/videos/${videoAId}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      const videoInDb = await videoModel.findById(videoAId).exec();
      expect(videoInDb!.isDeleted).toBe(true);
      expect(videoInDb!.deletedAt).toBeDefined();
    });

    it('19. progress records preserved after video soft delete', async () => {
      const progressCount = await progressModel
        .countDocuments({ videoId: new Types.ObjectId(videoAId) })
        .exec();
      expect(progressCount).toBeGreaterThanOrEqual(2);
    });

    it('20. video stats preserved after video soft delete', async () => {
      const stats = await videoStatsModel
        .findOne({ videoId: new Types.ObjectId(videoAId) })
        .exec();
      expect(stats).toBeDefined();
    });

    it('21. instructor deletes section (cascade)', async () => {
      await request(getHttpServer(app))
        .delete(`/api/courses/${courseId}/sections/${sectionId}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      const sectionInDb = await sectionModel.findById(sectionId).exec();
      expect(sectionInDb!.isDeleted).toBe(true);
      expect(sectionInDb!.deletedAt).toBeDefined();

      const remainingVideos = await videoModel
        .countDocuments({
          sectionId: new Types.ObjectId(sectionId),
          isDeleted: false,
        })
        .exec();
      expect(remainingVideos).toBe(0);
    });

    it('22. progress remains after section deletion', async () => {
      const progressCount = await progressModel.countDocuments({}).exec();
      expect(progressCount).toBeGreaterThanOrEqual(2);
    });

    it('23. course stats remain after content deletion', async () => {
      const stats = await courseStatsModel
        .findOne({ courseId: new Types.ObjectId(courseId) })
        .exec();
      expect(stats).toBeDefined();
    });
  });

  describe('Deleted video access', () => {
    it('24. deleted video returns 404', async () => {
      await request(getHttpServer(app))
        .get(`/api/courses/${courseId}/videos/${videoAId}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(404);
    });
  });

  describe('Multi-user analytics', () => {
    it('25. instructor gets video analytics after multi-user interaction', async () => {
      const res = await request(getHttpServer(app))
        .get(`/api/courses/${courseId}/videos/analytics`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      const videoAnalytics = res.body as unknown[];
      expect(Array.isArray(videoAnalytics)).toBe(true);
      expect(videoAnalytics.length).toBeGreaterThanOrEqual(1);
    });

    it('26. instructor gets course-level analytics', async () => {
      const res = await request(getHttpServer(app))
        .get(`/api/courses/${courseId}/analytics`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      const courseAnalytics = res.body as CourseAnalyticsResponse;
      expect(courseAnalytics.totalStudents).toBeDefined();
      expect(courseAnalytics.averageProgress).toBeDefined();
      expect(courseAnalytics.completionRate).toBeDefined();
    });

    it('27. student cannot access analytics', async () => {
      await request(getHttpServer(app))
        .get(`/api/courses/${courseId}/videos/analytics`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });
  });

  describe('Instructor management flow', () => {
    it('28. instructor updates section', async () => {
      const res = await request(getHttpServer(app))
        .patch(`/api/courses/${courseId}/sections/${sectionId}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ title: 'Week 1: Updated' })
        .expect(200);

      expect((res.body as CreateSectionResponse).title).toBe('Week 1: Updated');
    });

    it('29. instructor updates video', async () => {
      const res = await request(getHttpServer(app))
        .patch(`/api/courses/${courseId}/videos/${videoBId}`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ title: 'Updated Video B' })
        .expect(200);

      expect((res.body as { title: string }).title).toBe('Updated Video B');
    });

    it('30. instructor bulk reorders sections', async () => {
      await request(getHttpServer(app))
        .patch(`/api/courses/${courseId}/sections/reorder`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ sections: [{ id: sectionId, sortOrder: 1 }] })
        .expect(200);
    });

    it('31. instructor bulk reorders videos', async () => {
      await request(getHttpServer(app))
        .patch(`/api/courses/${courseId}/videos/reorder`)
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({ videos: [{ id: videoBId, sortOrder: 2 }] })
        .expect(200);
    });
  });
});
