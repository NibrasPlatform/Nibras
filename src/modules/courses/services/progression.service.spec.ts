import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProgressionService } from './progression.service';
import { User } from '@modules/auth/schemas/user.schema';
import { Course, CourseDocument } from '../schemas/course.schema';
import { CourseMembership } from '../schemas/course-membership.schema';
import { Track } from '../schemas/track.schema';
import { CourseLevel, CourseEventType } from '../enums/course.enums';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';

function mockQuery<T>(returnValue: T): unknown {
  return {
    exec: jest.fn<Promise<T>, []>().mockResolvedValue(returnValue),
    select: jest.fn().mockReturnThis(),
  };
}

function mockSelectQuery<T>(returnValue: T): unknown {
  return {
    select: jest.fn<{ exec: jest.Mock<Promise<T>> }, []>().mockReturnValue({
      exec: jest.fn<Promise<T>, []>().mockResolvedValue(returnValue),
    }),
  };
}

function mockFind<T>(returnValue: T[]): unknown {
  return { exec: jest.fn<Promise<T[]>, []>().mockResolvedValue(returnValue) };
}

function mockFindSorted<T>(returnValue: T[]): unknown {
  return {
    sort: jest.fn<{ exec: jest.Mock<Promise<T[]>> }, []>().mockReturnValue({
      exec: jest.fn<Promise<T[]>, []>().mockResolvedValue(returnValue),
    }),
  };
}

const mockAuthenticatedUser: AuthenticatedUser = {
  id: new Types.ObjectId().toString(),
  email: 'student@test.com',
  username: 'student',
  role: 'student',
  roleId: '',
  permissions: [],
  reputationScore: 0,
  githubLinked: false,
  emailVerified: false,
  preferences: {},
};

describe('ProgressionService', () => {
  let service: ProgressionService;
  let userModel: Model<User>;
  let courseModel: Model<Course>;
  let membershipModel: Model<CourseMembership>;
  let trackModel: Model<Track>;
  let eventEmitter: EventEmitter2;

  const mockUserId = new Types.ObjectId().toString();
  const mockTrackId = new Types.ObjectId();
  const mockCourseId1 = new Types.ObjectId();
  const mockSectionId = new Types.ObjectId();
  const mockVideoId = new Types.ObjectId();

  function sectionModelMock() {
    return {
      find: jest
        .fn()
        .mockReturnValue(mockSelectQuery([{ _id: mockSectionId }])),
    };
  }

  function videoModelMock(videoCount = 1) {
    return {
      find: jest
        .fn()
        .mockReturnValue(
          mockSelectQuery(
            Array.from({ length: videoCount }, () => ({ _id: mockVideoId })),
          ),
        ),
      countDocuments: jest.fn().mockReturnValue(mockQuery(videoCount)),
    };
  }

  function progressModelMock(completedCount: number) {
    return {
      countDocuments: jest.fn().mockReturnValue(mockQuery(completedCount)),
    };
  }

  function dbMock(
    overrides: { videoCount?: number; completedCount?: number } = {},
  ) {
    const { videoCount = 1, completedCount = 1 } = overrides;
    return {
      model: jest.fn((name: string) => {
        if (name === 'CourseSection') return sectionModelMock();
        if (name === 'CourseVideo') return videoModelMock(videoCount);
        if (name === 'VideoProgress') return progressModelMock(completedCount);
        return {};
      }),
    };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressionService,
        {
          provide: getModelToken(User.name),
          useValue: {
            findById: jest.fn(),
            findOneAndUpdate: jest.fn(),
          },
        },
        {
          provide: getModelToken(Course.name),
          useValue: {
            find: jest.fn(),
            db: dbMock(),
          },
        },
        {
          provide: getModelToken(CourseMembership.name),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getModelToken(Track.name),
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emitAsync: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProgressionService>(ProgressionService);
    userModel = module.get<Model<User>>(getModelToken(User.name));
    courseModel = module.get<Model<Course>>(getModelToken(Course.name));
    membershipModel = module.get<Model<CourseMembership>>(
      getModelToken(CourseMembership.name),
    );
    trackModel = module.get<Model<Track>>(getModelToken(Track.name));
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateTrackLevelConsistency', () => {
    it('should allow Beginner course with null trackId', async () => {
      await expect(
        service.validateTrackLevelConsistency({
          level: CourseLevel.Beginner,
          trackId: null,
        }),
      ).resolves.toBeUndefined();
    });

    it('should reject Beginner course with trackId', async () => {
      await expect(
        service.validateTrackLevelConsistency({
          level: CourseLevel.Beginner,
          trackId: new Types.ObjectId(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow Intermediate course with null trackId', async () => {
      await expect(
        service.validateTrackLevelConsistency({
          level: CourseLevel.Intermediate,
          trackId: null,
        }),
      ).resolves.toBeUndefined();
    });

    it('should reject Advanced course without trackId', async () => {
      await expect(
        service.validateTrackLevelConsistency({
          level: CourseLevel.Advanced,
          trackId: null,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow Advanced course with trackId', async () => {
      await expect(
        service.validateTrackLevelConsistency({
          level: CourseLevel.Advanced,
          trackId: new Types.ObjectId(),
        }),
      ).resolves.toBeUndefined();
    });

    it('should reject Expert course without trackId', async () => {
      await expect(
        service.validateTrackLevelConsistency({
          level: CourseLevel.Expert,
          trackId: null,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('evaluateStudentLevel', () => {
    it('should throw if user not found', async () => {
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(null) as ReturnType<typeof userModel.findById>,
        );

      await expect(service.evaluateStudentLevel(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return current level if already max', async () => {
      const expertUser = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Expert,
        selectedTrackId: null,
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(expertUser) as ReturnType<typeof userModel.findById>,
        );

      const result = await service.evaluateStudentLevel(mockUserId);
      expect(result).toBe(CourseLevel.Expert);
    });

    it('should advance to next level when all courses completed', async () => {
      const beginnerUser = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Beginner,
        selectedTrackId: null,
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(beginnerUser) as ReturnType<typeof userModel.findById>,
        );
      jest.spyOn(userModel, 'findOneAndUpdate').mockReturnValue(
        mockQuery({
          ...beginnerUser,
          currentLevel: CourseLevel.Intermediate,
        }) as ReturnType<typeof userModel.findOneAndUpdate>,
      );

      const courseDoc = {
        _id: mockCourseId1,
        level: CourseLevel.Beginner,
        isActive: true,
        deletedAt: null,
        trackId: null,
      };
      jest
        .spyOn(courseModel, 'find')
        .mockReturnValue(
          mockFind([courseDoc]) as ReturnType<typeof courseModel.find>,
        );

      jest.spyOn(membershipModel, 'findOne').mockReturnValue(
        mockQuery({
          courseId: mockCourseId1,
          userId: new Types.ObjectId(mockUserId),
        }) as ReturnType<typeof membershipModel.findOne>,
      );

      const emitAsyncSpy = jest
        .spyOn(eventEmitter, 'emitAsync')
        .mockResolvedValue([] as never);

      const result = await service.evaluateStudentLevel(mockUserId);
      expect(result).toBe(CourseLevel.Intermediate);
      expect(emitAsyncSpy).toHaveBeenCalledWith(
        CourseEventType.LevelCompleted,
        expect.objectContaining({
          userId: mockUserId,
          level: CourseLevel.Beginner,
        }),
      );
      expect(emitAsyncSpy).toHaveBeenCalledWith(
        CourseEventType.LevelUnlocked,
        expect.objectContaining({
          userId: mockUserId,
          level: CourseLevel.Intermediate,
        }),
      );
    });

    it('should not advance when courses are not completed', async () => {
      const beginnerUser = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Beginner,
        selectedTrackId: null,
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(beginnerUser) as ReturnType<typeof userModel.findById>,
        );

      const courseDoc = {
        _id: mockCourseId1,
        level: CourseLevel.Beginner,
        isActive: true,
        deletedAt: null,
        trackId: null,
      };
      jest
        .spyOn(courseModel, 'find')
        .mockReturnValue(
          mockFind([courseDoc]) as ReturnType<typeof courseModel.find>,
        );

      jest.spyOn(membershipModel, 'findOne').mockReturnValue(
        mockQuery({
          courseId: mockCourseId1,
          userId: new Types.ObjectId(mockUserId),
        }) as ReturnType<typeof membershipModel.findOne>,
      );

      const dbMock = {
        model: jest.fn((name: string) => {
          if (name === 'CourseSection')
            return {
              find: jest
                .fn()
                .mockReturnValue(mockSelectQuery([{ _id: mockSectionId }])),
            };
          if (name === 'CourseVideo')
            return {
              find: jest
                .fn()
                .mockReturnValue(mockSelectQuery([{ _id: mockVideoId }])),
              countDocuments: jest.fn().mockReturnValue(mockQuery(1)),
            };
          if (name === 'VideoProgress')
            return { countDocuments: jest.fn().mockReturnValue(mockQuery(0)) };
          return {};
        }),
      };
      Object.defineProperty(courseModel, 'db', {
        value: dbMock,
        writable: true,
      });

      const findOneAndUpdateSpy = jest.spyOn(userModel, 'findOneAndUpdate');

      const result = await service.evaluateStudentLevel(mockUserId);
      expect(result).toBe(CourseLevel.Beginner);
      expect(findOneAndUpdateSpy).not.toHaveBeenCalled();
    });

    it('should not advance if no courses exist in current level', async () => {
      const beginnerUser = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Beginner,
        selectedTrackId: null,
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(beginnerUser) as ReturnType<typeof userModel.findById>,
        );
      jest
        .spyOn(courseModel, 'find')
        .mockReturnValue(mockFind([]) as ReturnType<typeof courseModel.find>);

      const result = await service.evaluateStudentLevel(mockUserId);
      expect(result).toBe(CourseLevel.Beginner);
    });

    it('should skip event emission on failure without crashing', async () => {
      const beginnerUser = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Beginner,
        selectedTrackId: null,
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(beginnerUser) as ReturnType<typeof userModel.findById>,
        );
      jest.spyOn(userModel, 'findOneAndUpdate').mockReturnValue(
        mockQuery({
          ...beginnerUser,
          currentLevel: CourseLevel.Intermediate,
        }) as ReturnType<typeof userModel.findOneAndUpdate>,
      );

      const courseDoc = {
        _id: mockCourseId1,
        level: CourseLevel.Beginner,
        isActive: true,
        deletedAt: null,
        trackId: null,
      };
      jest
        .spyOn(courseModel, 'find')
        .mockReturnValue(
          mockFind([courseDoc]) as ReturnType<typeof courseModel.find>,
        );
      jest.spyOn(membershipModel, 'findOne').mockReturnValue(
        mockQuery({
          courseId: mockCourseId1,
          userId: new Types.ObjectId(mockUserId),
        }) as ReturnType<typeof membershipModel.findOne>,
      );

      jest
        .spyOn(eventEmitter, 'emitAsync')
        .mockRejectedValue(new Error('emit failed'));

      const result = await service.evaluateStudentLevel(mockUserId);
      expect(result).toBe(CourseLevel.Intermediate);
    });
  });

  describe('validateEnrollment', () => {
    function makeCourseDoc(overrides: Partial<Course> = {}): CourseDocument {
      return {
        _id: mockCourseId1,
        level: CourseLevel.Beginner,
        isActive: true,
        deletedAt: null,
        trackId: null,
        ...overrides,
      } as CourseDocument;
    }

    it('should throw if user not found', async () => {
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(null) as ReturnType<typeof userModel.findById>,
        );

      await expect(
        service.validateEnrollment(mockUserId, makeCourseDoc()),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if course level is higher than user level', async () => {
      const user = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Beginner,
        selectedTrackId: null,
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(user) as ReturnType<typeof userModel.findById>,
        );

      await expect(
        service.validateEnrollment(
          mockUserId,
          makeCourseDoc({ level: CourseLevel.Intermediate }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if course level is lower than user level', async () => {
      const user = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Intermediate,
        selectedTrackId: null,
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(user) as ReturnType<typeof userModel.findById>,
        );

      await expect(
        service.validateEnrollment(
          mockUserId,
          makeCourseDoc({ level: CourseLevel.Beginner }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if track not selected for Advanced course', async () => {
      const user = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Advanced,
        selectedTrackId: null,
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(user) as ReturnType<typeof userModel.findById>,
        );
      jest
        .spyOn(courseModel, 'find')
        .mockReturnValue(mockFind([]) as ReturnType<typeof courseModel.find>);

      await expect(
        service.validateEnrollment(
          mockUserId,
          makeCourseDoc({ level: CourseLevel.Advanced, trackId: mockTrackId }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if course belongs to a different track', async () => {
      const otherTrackId = new Types.ObjectId();
      const user = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Advanced,
        selectedTrackId: mockTrackId,
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(user) as ReturnType<typeof userModel.findById>,
        );
      jest
        .spyOn(courseModel, 'find')
        .mockReturnValue(mockFind([]) as ReturnType<typeof courseModel.find>);

      await expect(
        service.validateEnrollment(
          mockUserId,
          makeCourseDoc({ level: CourseLevel.Advanced, trackId: otherTrackId }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should pass validation for valid enrollment', async () => {
      const user = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Advanced,
        selectedTrackId: mockTrackId,
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(user) as ReturnType<typeof userModel.findById>,
        );
      jest
        .spyOn(courseModel, 'find')
        .mockReturnValue(mockFind([]) as ReturnType<typeof courseModel.find>);

      await expect(
        service.validateEnrollment(
          mockUserId,
          makeCourseDoc({ level: CourseLevel.Advanced, trackId: mockTrackId }),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('adminOverrideTrack', () => {
    it('should throw if trackId is not a valid ObjectId', async () => {
      const user = {
        _id: new Types.ObjectId(mockUserId),
        selectedTrackId: null,
        save: jest.fn(),
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(user) as ReturnType<typeof userModel.findById>,
        );

      await expect(
        service.adminOverrideTrack('adminId', mockUserId, 'invalid-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set track for user', async () => {
      const saveMock = jest.fn().mockResolvedValue(true);
      const user = {
        _id: new Types.ObjectId(mockUserId),
        selectedTrackId: null,
        save: saveMock,
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(user) as ReturnType<typeof userModel.findById>,
        );
      jest
        .spyOn(trackModel, 'findById')
        .mockReturnValue(
          mockQuery({ _id: mockTrackId }) as ReturnType<
            typeof trackModel.findById
          >,
        );

      await service.adminOverrideTrack(
        'adminId',
        mockUserId,
        mockTrackId.toString(),
      );
      expect(
        (user as unknown as { selectedTrackId: Types.ObjectId })
          .selectedTrackId,
      ).toEqual(mockTrackId);
      expect(saveMock).toHaveBeenCalled();
    });

    it('should clear track when null', async () => {
      const saveMock = jest.fn().mockResolvedValue(true);
      const user = {
        _id: new Types.ObjectId(mockUserId),
        selectedTrackId: mockTrackId,
        save: saveMock,
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(user) as ReturnType<typeof userModel.findById>,
        );

      await service.adminOverrideTrack('adminId', mockUserId, null);
      expect(
        (user as unknown as { selectedTrackId: null }).selectedTrackId,
      ).toBeNull();
      expect(saveMock).toHaveBeenCalled();
    });

    it('should throw if user not found', async () => {
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(null) as ReturnType<typeof userModel.findById>,
        );

      await expect(
        service.adminOverrideTrack(
          'adminId',
          mockUserId,
          mockTrackId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAvailableCourses', () => {
    it('should return empty if user not found', async () => {
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(null) as ReturnType<typeof userModel.findById>,
        );

      const result = await service.getAvailableCourses(mockAuthenticatedUser);
      expect(result).toEqual([]);
    });

    it('should return Beginner courses for beginner user', async () => {
      const user = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Beginner,
        selectedTrackId: null,
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(user) as ReturnType<typeof userModel.findById>,
        );

      const courses = [
        {
          _id: mockCourseId1,
          title: 'Course 1',
          toObject: () => ({ title: 'Course 1' }),
        },
      ];
      jest
        .spyOn(courseModel, 'find')
        .mockReturnValue(
          mockFindSorted(courses) as ReturnType<typeof courseModel.find>,
        );
      jest
        .spyOn(membershipModel, 'find')
        .mockReturnValue(
          mockQuery([]) as ReturnType<typeof membershipModel.find>,
        );

      const result = await service.getAvailableCourses(mockAuthenticatedUser);
      expect(result).toHaveLength(1);
    });

    it('should return empty for Advanced user without track', async () => {
      const user = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Advanced,
        selectedTrackId: null,
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(user) as ReturnType<typeof userModel.findById>,
        );

      const result = await service.getAvailableCourses(mockAuthenticatedUser);
      expect(result).toEqual([]);
    });
  });
});
