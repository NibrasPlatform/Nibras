import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { SectionsService } from './sections.service';
import { CourseSection } from '../schemas/course-section.schema';
import { CourseVideo } from '../schemas/course-video.schema';
import { CourseAccessService } from '@modules/courses/services/course-access.service';
import { CoursesService } from '@modules/courses/services/courses.service';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';

const mockCourseId = new Types.ObjectId().toString();
const mockSectionId = new Types.ObjectId().toString();

const mockSectionDoc = {
  _id: new Types.ObjectId(mockSectionId),
  courseId: new Types.ObjectId(mockCourseId),
  title: 'Test Section',
  description: 'Test description',
  sortOrder: 0,
  isPublished: true,
  isDeleted: false,
  deletedAt: null,
  save: jest.fn().mockResolvedValue(this),
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

const mockCourseAccess = {
  canManageCourseForRequest: jest.fn().mockResolvedValue(true),
  canViewCourseForRequest: jest.fn().mockResolvedValue(true),
};

const mockCoursesService = {
  assertCourseExists: jest.fn().mockResolvedValue(true),
};

describe('SectionsService', () => {
  let service: SectionsService;
  let sectionModel: Model<CourseSection>;
  let videoModel: Model<CourseVideo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SectionsService,
        {
          provide: getModelToken(CourseSection.name),
          useValue: {
            findOne: jest
              .fn()
              .mockImplementation((filter: Record<string, unknown>) => {
                if (filter?.courseId) {
                  return {
                    sort: jest.fn().mockReturnValue({
                      select: jest.fn().mockReturnValue({
                        exec: jest.fn().mockResolvedValue(null),
                      }),
                    }),
                  };
                }
                return {
                  exec: jest.fn().mockResolvedValue(mockSectionDoc),
                };
              }),
            findById: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockSectionDoc),
            }),
            find: jest.fn().mockImplementation(() => ({
              select: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([mockSectionDoc]),
              }),
              sort: jest.fn().mockReturnThis(),
              exec: jest.fn().mockResolvedValue([mockSectionDoc]),
            })),
            create: jest.fn().mockResolvedValue(mockSectionDoc),
            bulkWrite: jest.fn().mockResolvedValue({ ok: 1 }),
            aggregate: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([]),
            }),
          },
        },
        {
          provide: getModelToken(CourseVideo.name),
          useValue: {
            find: jest.fn().mockImplementation(() => ({
              sort: jest.fn().mockReturnThis(),
              exec: jest.fn().mockResolvedValue([]),
            })),
            updateMany: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
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

    service = module.get<SectionsService>(SectionsService);
    sectionModel = module.get(getModelToken(CourseSection.name));
    videoModel = module.get(getModelToken(CourseVideo.name));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a section successfully', async () => {
      const result = await service.create(mockUser, mockCourseId, {
        title: 'New Section',
        description: 'Description',
        sortOrder: 1,
      });

      expect(result.title).toBe('Test Section');
      expect(result.courseId).toBe(mockCourseId);
    });

    it('auto-assigns sortOrder when not provided', async () => {
      const result = await service.create(mockUser, mockCourseId, {
        title: 'New Section',
      });

      expect(result).toBeDefined();
    });

    it('throws ForbiddenException for non-manager', async () => {
      mockCourseAccess.canManageCourseForRequest.mockResolvedValueOnce(false);

      await expect(
        service.create(mockUser, mockCourseId, {
          title: 'Test',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for non-existent course', async () => {
      mockCoursesService.assertCourseExists.mockRejectedValueOnce(
        new NotFoundException(),
      );

      await expect(
        service.create(mockUser, mockCourseId, {
          title: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates a section successfully', async () => {
      const result = await service.update(
        mockUser,
        mockCourseId,
        mockSectionId,
        {
          title: 'Updated Title',
          description: 'Updated desc',
          isPublished: false,
        },
      );

      expect(result).toBeDefined();
    });

    it('throws ForbiddenException for non-manager', async () => {
      mockCourseAccess.canManageCourseForRequest.mockResolvedValueOnce(false);

      await expect(
        service.update(mockUser, mockCourseId, mockSectionId, {
          title: 'Test',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when section not in course', async () => {
      const wrongSection = {
        ...mockSectionDoc,
        courseId: new Types.ObjectId(),
      };
      jest.spyOn(sectionModel, 'findById').mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(wrongSection),
      } as unknown as ReturnType<Model<CourseSection>['findById']>);

      await expect(
        service.update(mockUser, mockCourseId, mockSectionId, {
          title: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('soft deletes section and cascades to videos', async () => {
      const result = await service.delete(
        mockUser,
        mockCourseId,
        mockSectionId,
      );

      expect(result).toEqual({ ok: true });
      expect(jest.spyOn(videoModel, 'updateMany')).toHaveBeenCalledWith(
        { sectionId: mockSectionDoc._id },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        { $set: { isDeleted: true, deletedAt: expect.any(Date) } },
      );
    });

    it('throws ForbiddenException for non-manager', async () => {
      mockCourseAccess.canManageCourseForRequest.mockResolvedValueOnce(false);

      await expect(
        service.delete(mockUser, mockCourseId, mockSectionId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reorder', () => {
    it('reorders sections successfully', async () => {
      const result = await service.reorder(mockUser, mockCourseId, {
        sections: [{ id: mockSectionId, sortOrder: 2 }],
      });

      expect(result).toEqual({ ok: true });
    });

    it('throws BadRequestException for duplicate sortOrders', async () => {
      await expect(
        service.reorder(mockUser, mockCourseId, {
          sections: [
            { id: new Types.ObjectId().toString(), sortOrder: 0 },
            { id: new Types.ObjectId().toString(), sortOrder: 0 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException for non-manager', async () => {
      mockCourseAccess.canManageCourseForRequest.mockResolvedValueOnce(false);

      await expect(
        service.reorder(mockUser, mockCourseId, {
          sections: [{ id: mockSectionId, sortOrder: 1 }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('detects duplicate sortOrders after bulkWrite', async () => {
      jest.spyOn(sectionModel, 'aggregate').mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue([{ _id: 1, count: 2 }]),
      } as unknown as ReturnType<Model<CourseSection>['aggregate']>);

      await expect(
        service.reorder(mockUser, mockCourseId, {
          sections: [{ id: mockSectionId, sortOrder: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('list', () => {
    it('lists sections with nested videos', async () => {
      const result = await service.list(mockUser, mockCourseId);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].videos).toBeDefined();
    });

    it('throws ForbiddenException when cannot view course', async () => {
      mockCourseAccess.canViewCourseForRequest.mockResolvedValueOnce(false);

      await expect(service.list(mockUser, mockCourseId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
