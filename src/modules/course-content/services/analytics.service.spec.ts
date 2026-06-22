import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AnalyticsService } from './analytics.service';
import { CourseSection } from '../schemas/course-section.schema';
import { CourseVideo } from '../schemas/course-video.schema';
import { CourseVideoStats } from '../schemas/course-video-stats.schema';
import { CourseStats } from '../schemas/course-stats.schema';
import { CourseAccessService } from '@modules/courses/services/course-access.service';
import { CoursesService } from '@modules/courses/services/courses.service';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const mockUser: AuthenticatedUser = {
    id: new Types.ObjectId().toString(),
    email: 'instructor@test.com',
    username: 'instructor',
    role: 'instructor',
    roleId: new Types.ObjectId().toString(),
    permissions: [],
    reputationScore: 0,
    githubLinked: false,
    emailVerified: true,
    preferences: {},
  };

  const mockCourseId = new Types.ObjectId().toString();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getModelToken(CourseSection.name),
          useValue: {
            find: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                exec: jest
                  .fn()
                  .mockResolvedValue([{ _id: new Types.ObjectId() }]),
              }),
            }),
          },
        },
        {
          provide: getModelToken(CourseVideo.name),
          useValue: {
            find: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([
                  { _id: new Types.ObjectId(), title: 'Video 1' },
                  { _id: new Types.ObjectId(), title: 'Video 2' },
                ]),
              }),
            }),
          },
        },
        {
          provide: getModelToken(CourseVideoStats.name),
          useValue: {
            find: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([
                {
                  videoId: new Types.ObjectId(),
                  totalStudents: 10,
                  watchedCount: 7,
                  completionRate: 0.7,
                  avgProgress: 0.85,
                },
              ]),
            }),
          },
        },
        {
          provide: getModelToken(CourseStats.name),
          useValue: {
            findOne: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                totalStudents: 50,
                completionRate: 0.65,
                averageProgress: 0.72,
                activeStudentsLast30Days: 30,
              }),
            }),
          },
        },
        {
          provide: CourseAccessService,
          useValue: {
            canManageCourseForRequest: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: CoursesService,
          useValue: {
            assertCourseExists: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getVideoAnalytics', () => {
    it('returns video analytics array', async () => {
      const result = await service.getVideoAnalytics(mockUser, mockCourseId);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });
  });

  describe('getCourseAnalytics', () => {
    it('returns course-level analytics', async () => {
      const result = await service.getCourseAnalytics(mockUser, mockCourseId);

      expect(result.totalStudents).toBe(50);
      expect(result.completionRate).toBe(0.65);
      expect(result.averageProgress).toBe(0.72);
      expect(result.activeStudentsLast30Days).toBe(30);
    });

    it('returns zeros when no stats exist', async () => {
      const module = await Test.createTestingModule({
        providers: [
          AnalyticsService,
          {
            provide: getModelToken(CourseSection.name),
            useValue: {
              find: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([]),
                }),
              }),
            },
          },
          {
            provide: getModelToken(CourseVideo.name),
            useValue: {
              find: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([]),
                }),
              }),
            },
          },
          {
            provide: getModelToken(CourseVideoStats.name),
            useValue: {
              find: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
              }),
            },
          },
          {
            provide: getModelToken(CourseStats.name),
            useValue: {
              findOne: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
              }),
            },
          },
          {
            provide: CourseAccessService,
            useValue: {
              canManageCourseForRequest: jest.fn().mockResolvedValue(true),
            },
          },
          {
            provide: CoursesService,
            useValue: {
              assertCourseExists: jest.fn().mockResolvedValue(true),
            },
          },
        ],
      }).compile();

      const svc = module.get<AnalyticsService>(AnalyticsService);
      const result = await svc.getCourseAnalytics(mockUser, mockCourseId);

      expect(result.totalStudents).toBe(0);
      expect(result.completionRate).toBe(0);
      expect(result.averageProgress).toBe(0);
      expect(result.activeStudentsLast30Days).toBe(0);
    });
  });
});
