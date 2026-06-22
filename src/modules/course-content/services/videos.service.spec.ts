import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { VideosService } from './videos.service';
import { Course } from '@modules/courses/schemas/course.schema';
import { CourseSection } from '../schemas/course-section.schema';
import {
  CourseVideo,
  CourseVideoDocument,
} from '../schemas/course-video.schema';
import { VideoProgress } from '../schemas/video-progress.schema';
import { CourseAccessService } from '@modules/courses/services/course-access.service';
import { CoursesService } from '@modules/courses/services/courses.service';
import { VideoProvider } from '../enums/course-content.enums';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';

const mockCourseId = new Types.ObjectId().toString();
const mockSectionId = new Types.ObjectId().toString();

const mockSec = {
  _id: new Types.ObjectId(mockSectionId),
  courseId: new Types.ObjectId(mockCourseId),
  title: 'Test Section',
  description: '',
  sortOrder: 0,
  isDeleted: false,
};

const mockUser: AuthenticatedUser = {
  id: new Types.ObjectId().toString(),
  email: 'test@test.com',
  username: 'test',
  role: 'instructor',
  roleId: new Types.ObjectId().toString(),
  permissions: [],
  reputationScore: 0,
  githubLinked: false,
  emailVerified: true,
  preferences: {},
};

const mockVideo = {
  _id: new Types.ObjectId(),
  sectionId: new Types.ObjectId(mockSectionId),
  title: 'Test Video',
  description: '',
  provider: VideoProvider.YouTube,
  externalId: 'dQw4w9WgXcQ',
  embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  durationSeconds: 120,
  sortOrder: 0,
  isPublished: true,
  requiresVideoId: null,
  linkedProjectId: null,
  resources: [],
  isDeleted: false,
  save: jest.fn().mockResolvedValue(this),
};

const mockCourseAccess = {
  canManageCourseForRequest: jest.fn().mockResolvedValue(true),
  canViewCourseForRequest: jest.fn().mockResolvedValue(true),
};

const mockCoursesService = {
  assertCourseExists: jest.fn().mockResolvedValue(true),
};

describe('VideosService', () => {
  let service: VideosService;
  const mockSection = mockSec;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideosService,
        {
          provide: getModelToken(Course.name),
          useValue: {
            findById: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({ sequentialVideos: false }),
            }),
          },
        },
        {
          provide: getModelToken(CourseSection.name),
          useValue: {
            findOne: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockSection),
            }),
            findById: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockSection),
            }),
            find: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([mockSection]),
              }),
            }),
          },
        },
        {
          provide: getModelToken(CourseVideo.name),
          useValue: {
            findOne: jest
              .fn()
              .mockImplementation((filter: Record<string, unknown>) => {
                if (filter?._id) {
                  return {
                    select: jest.fn().mockReturnValue({
                      exec: jest.fn().mockResolvedValue(null),
                    }),
                  };
                }
                return {
                  sort: jest.fn().mockReturnValue({
                    select: jest.fn().mockReturnValue({
                      exec: jest.fn().mockResolvedValue(null),
                    }),
                  }),
                };
              }),
            create: jest.fn().mockResolvedValue(mockVideo),
            findById: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockVideo),
            }),
            find: jest.fn().mockImplementation(() => ({
              select: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
              }),
              exec: jest.fn().mockResolvedValue([]),
            })),
            bulkWrite: jest.fn().mockResolvedValue({ ok: 1 }),
          },
        },
        {
          provide: getModelToken(VideoProgress.name),
          useValue: {
            findOne: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(null),
            }),
          },
        },
        {
          provide: CourseAccessService,
          useValue: mockCourseAccess,
        },
        {
          provide: CoursesService,
          useValue: mockCoursesService,
        },
      ],
    }).compile();

    service = module.get<VideosService>(VideosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a video successfully', async () => {
      const result = await service.create(
        mockUser,
        mockCourseId,
        mockSectionId,
        {
          title: 'Test Video',
          provider: VideoProvider.YouTube,
          externalId: 'dQw4w9WgXcQ',
          embedUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      );

      expect(result.title).toBe('Test Video');
      expect(result.embedUrl).toContain('youtube-nocookie.com');
    });

    it('throws ForbiddenException for non-manager', async () => {
      mockCourseAccess.canManageCourseForRequest.mockResolvedValueOnce(false);

      await expect(
        service.create(mockUser, mockCourseId, mockSectionId, {
          title: 'Test',
          provider: VideoProvider.YouTube,
          externalId: 'test',
          embedUrl: 'https://example.com',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('isLocked', () => {
    it('returns false when course has sequentialVideos disabled', async () => {
      const video = { ...mockVideo, requiresVideoId: new Types.ObjectId() };
      const locked = await service.isLocked(
        mockUser,
        mockCourseId,
        video as unknown as CourseVideoDocument,
      );

      expect(locked).toBe(false);
    });

    it('returns true when prereq not completed', async () => {
      const lockedModule = await buildLockModule(true);
      const svc = lockedModule.get<VideosService>(VideosService);
      const video = {
        ...mockVideo,
        requiresVideoId: new Types.ObjectId(),
      };
      const locked = await svc.isLocked(
        mockUser,
        mockCourseId,
        video as unknown as CourseVideoDocument,
      );
      expect(locked).toBe(true);
    });

    it('returns false when video has no prerequisite', async () => {
      const module = await Test.createTestingModule({
        providers: [
          VideosService,
          {
            provide: getModelToken(Course.name),
            useValue: {
              findById: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue({ sequentialVideos: true }),
              }),
            },
          },
          {
            provide: getModelToken(CourseSection.name),
            useValue: {
              findOne: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockSection),
              }),
              findById: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockSection),
              }),
              find: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([mockSection]),
                }),
              }),
            },
          },
          {
            provide: getModelToken(CourseVideo.name),
            useValue: {
              findOne: jest.fn().mockReturnValue({
                sort: jest.fn().mockReturnValue({
                  select: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(null),
                  }),
                }),
              }),
              create: jest.fn().mockResolvedValue(mockVideo),
              findById: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockVideo),
              }),
              find: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([]),
                }),
                exec: jest.fn().mockResolvedValue([]),
              }),
              bulkWrite: jest.fn().mockResolvedValue({ ok: 1 }),
            },
          },
          {
            provide: getModelToken(VideoProgress.name),
            useValue: {
              findOne: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
              }),
            },
          },
          {
            provide: CourseAccessService,
            useValue: mockCourseAccess,
          },
          {
            provide: CoursesService,
            useValue: mockCoursesService,
          },
        ],
      }).compile();

      const svc = module.get<VideosService>(VideosService);
      const video = { ...mockVideo, requiresVideoId: null };
      const locked = await svc.isLocked(
        mockUser,
        mockCourseId,
        video as unknown as CourseVideoDocument,
      );

      expect(locked).toBe(false);
    });
  });

  describe('detail (lock enforcement)', () => {
    it('throws ForbiddenException when student accesses locked video', async () => {
      const lockedModule = await buildLockModule(false);
      const svc = lockedModule.get<VideosService>(VideosService);

      await expect(
        svc.detail(mockUser, mockCourseId, mockVideo._id.toString()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows manager to access locked video', async () => {
      const lockedModule = await buildLockModule(true);
      const svc = lockedModule.get<VideosService>(VideosService);
      const record = await svc.detail(
        mockUser,
        mockCourseId,
        mockVideo._id.toString(),
      );

      expect(record.locked).toBe(true);
      expect(record.id).toBe(mockVideo._id.toString());
    });
  });

  describe('reorder', () => {
    it('throws BadRequestException for duplicate sortOrders', async () => {
      await expect(
        service.reorder(mockUser, mockCourseId, {
          videos: [
            { id: new Types.ObjectId().toString(), sortOrder: 0 },
            { id: new Types.ObjectId().toString(), sortOrder: 0 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('circular dependency', () => {
    it('throws BadRequestException for self-referencing requiresVideoId', async () => {
      const selfId = new Types.ObjectId().toString();
      const selfVideo = {
        ...mockVideo,
        _id: new Types.ObjectId(selfId),
      };

      const cycleModule = await Test.createTestingModule({
        providers: [
          VideosService,
          {
            provide: getModelToken(Course.name),
            useValue: {
              findById: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue({ sequentialVideos: false }),
              }),
            },
          },
          {
            provide: getModelToken(CourseSection.name),
            useValue: {
              findOne: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockSection),
              }),
              findById: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockSection),
              }),
              find: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([mockSection]),
                }),
              }),
            },
          },
          {
            provide: getModelToken(CourseVideo.name),
            useValue: {
              findOne: jest
                .fn()
                .mockImplementation((filter: Record<string, unknown>) => {
                  if (filter?._id) {
                    return {
                      select: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue({
                          _id: filter._id as Types.ObjectId,
                          requiresVideoId: new Types.ObjectId(selfId),
                        }),
                      }),
                    };
                  }
                  return {
                    sort: jest.fn().mockReturnValue({
                      select: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(null),
                      }),
                    }),
                  };
                }),
              create: jest.fn().mockResolvedValue(selfVideo),
              findById: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(selfVideo),
              }),
              find: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue([]),
                }),
                exec: jest.fn().mockResolvedValue([]),
              }),
              bulkWrite: jest.fn().mockResolvedValue({ ok: 1 }),
            },
          },
          {
            provide: getModelToken(VideoProgress.name),
            useValue: {
              findOne: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
              }),
            },
          },
          {
            provide: CourseAccessService,
            useValue: mockCourseAccess,
          },
          {
            provide: CoursesService,
            useValue: mockCoursesService,
          },
        ],
      }).compile();

      const svc = cycleModule.get<VideosService>(VideosService);

      await expect(
        svc.create(mockUser, mockCourseId, mockSectionId, {
          title: 'Test',
          provider: VideoProvider.YouTube,
          externalId: 'test',
          embedUrl: 'https://example.com',
          requiresVideoId: selfId,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

function buildLockModule(isManager: boolean) {
  const access = {
    canManageCourseForRequest: jest.fn().mockResolvedValue(isManager),
    canViewCourseForRequest: jest.fn().mockResolvedValue(true),
  };

  const prereqId = new Types.ObjectId();

  return Test.createTestingModule({
    providers: [
      VideosService,
      {
        provide: getModelToken(Course.name),
        useValue: {
          findById: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ sequentialVideos: true }),
          }),
        },
      },
      {
        provide: getModelToken(CourseSection.name),
        useValue: {
          findOne: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockSec),
          }),
          findById: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockSec),
          }),
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([mockSec]),
            }),
          }),
        },
      },
      {
        provide: getModelToken(CourseVideo.name),
        useValue: {
          findOne: jest
            .fn()
            .mockImplementation((filter: Record<string, unknown>) => {
              if (filter?._id) {
                const doc = {
                  ...mockVideo,
                  _id: filter._id as Types.ObjectId,
                  requiresVideoId: prereqId,
                };
                return {
                  select: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(doc),
                  }),
                  exec: jest.fn().mockResolvedValue(doc),
                };
              }
              return {
                sort: jest.fn().mockReturnValue({
                  select: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(null),
                  }),
                }),
              };
            }),
          create: jest.fn().mockResolvedValue(null),
          findById: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              ...mockVideo,
              requiresVideoId: prereqId,
            }),
          }),
          find: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([]),
            }),
            exec: jest.fn().mockResolvedValue([]),
          }),
          bulkWrite: jest.fn().mockResolvedValue({ ok: 1 }),
        },
      },
      {
        provide: getModelToken(VideoProgress.name),
        useValue: {
          findOne: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        },
      },
      {
        provide: CourseAccessService,
        useValue: access,
      },
      {
        provide: CoursesService,
        useValue: mockCoursesService,
      },
    ],
  }).compile();
}
