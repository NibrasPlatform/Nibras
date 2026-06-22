import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import { NotFoundException } from '@nestjs/common';
import { TestingService } from './testing.service';
import { User } from '@modules/auth/schemas/user.schema';
import { Course } from '@modules/courses/schemas/course.schema';
import { CourseMembership } from '@modules/courses/schemas/course-membership.schema';
import { CourseSection } from '@modules/course-content/schemas/course-section.schema';
import { CourseVideo } from '@modules/course-content/schemas/course-video.schema';
import { VideoProgress } from '@modules/course-content/schemas/video-progress.schema';
import { ProgressionService } from '@modules/courses/services/progression.service';
import { CourseLevel } from '@modules/courses/enums/course.enums';
import { VideoEventType } from '@modules/course-content/enums/course-content.enums';

function mockQuery<T>(returnValue: T): unknown {
  return { exec: jest.fn<Promise<T>, []>().mockResolvedValue(returnValue) };
}

function mockSelectQuery<T>(returnValue: T): unknown {
  return {
    select: jest.fn<{ exec: jest.Mock<Promise<T>> }, []>().mockReturnValue({
      exec: jest.fn<Promise<T>, []>().mockResolvedValue(returnValue),
    }),
  };
}

describe('TestingService', () => {
  let service: TestingService;
  let userModel: Model<User>;
  let courseModel: Model<Course>;
  let membershipModel: Model<CourseMembership>;
  let sectionModel: Model<CourseSection>;
  let videoModel: Model<CourseVideo>;
  let progressModel: Model<VideoProgress>;
  let progressionService: ProgressionService;
  let eventEmitter: EventEmitter2;

  const mockUserId = new Types.ObjectId().toString();
  const mockCourseId = new Types.ObjectId();
  const mockSectionId = new Types.ObjectId();
  const mockVideoId = new Types.ObjectId();
  const mockTrackId = new Types.ObjectId();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestingService,
        {
          provide: getModelToken(User.name),
          useValue: {
            findById: jest.fn(),
            findByIdAndUpdate: jest.fn(),
          },
        },
        {
          provide: getModelToken(Course.name),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getModelToken(CourseMembership.name),
          useValue: {
            findOneAndUpdate: jest.fn(),
            deleteMany: jest.fn(),
          },
        },
        {
          provide: getModelToken(CourseSection.name),
          useValue: {
            find: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: getModelToken(CourseVideo.name),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getModelToken(VideoProgress.name),
          useValue: {
            findOneAndUpdate: jest.fn(),
            deleteMany: jest.fn(),
          },
        },
        {
          provide: ProgressionService,
          useValue: {
            evaluateStudentLevel: jest.fn(),
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

    service = module.get<TestingService>(TestingService);
    userModel = module.get<Model<User>>(getModelToken(User.name));
    courseModel = module.get<Model<Course>>(getModelToken(Course.name));
    membershipModel = module.get<Model<CourseMembership>>(
      getModelToken(CourseMembership.name),
    );
    sectionModel = module.get<Model<CourseSection>>(
      getModelToken(CourseSection.name),
    );
    videoModel = module.get<Model<CourseVideo>>(
      getModelToken(CourseVideo.name),
    );
    progressModel = module.get<Model<VideoProgress>>(
      getModelToken(VideoProgress.name),
    );
    progressionService = module.get<ProgressionService>(ProgressionService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('completeVideo', () => {
    it('should mark video as complete and emit event', async () => {
      const video = {
        _id: mockVideoId,
        sectionId: mockSectionId,
        durationSeconds: 120,
      };
      const section = {
        _id: mockSectionId,
        courseId: mockCourseId,
      };

      jest
        .spyOn(videoModel, 'findOne')
        .mockReturnValue(
          mockQuery(video) as ReturnType<typeof videoModel.findOne>,
        );
      jest
        .spyOn(sectionModel, 'findById')
        .mockReturnValue(
          mockQuery(section) as ReturnType<typeof sectionModel.findById>,
        );
      jest
        .spyOn(progressModel, 'findOneAndUpdate')
        .mockReturnValue(
          mockQuery({}) as ReturnType<typeof progressModel.findOneAndUpdate>,
        );
      jest
        .spyOn(progressionService, 'evaluateStudentLevel')
        .mockResolvedValue(CourseLevel.Beginner);
      jest.spyOn(eventEmitter, 'emitAsync').mockResolvedValue([true]);

      const result = await service.completeVideo(
        'adminId',
        mockVideoId.toString(),
        mockUserId,
      );

      expect(result).toEqual({ success: true });
      expect(jest.spyOn(eventEmitter, 'emitAsync')).toHaveBeenCalledWith(
        VideoEventType.VideoCompleted,
        expect.objectContaining({
          videoId: mockVideoId.toString(),
          watched: true,
          watchedProgress: 1,
        }),
      );
      expect(
        jest.spyOn(progressionService, 'evaluateStudentLevel'),
      ).toHaveBeenCalledWith(mockUserId);
    });

    it('should throw if video not found', async () => {
      jest
        .spyOn(videoModel, 'findOne')
        .mockReturnValue(
          mockQuery(null) as ReturnType<typeof videoModel.findOne>,
        );

      await expect(
        service.completeVideo('adminId', mockVideoId.toString(), mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if section not found for video', async () => {
      const video = {
        _id: mockVideoId,
        sectionId: mockSectionId,
        durationSeconds: 120,
      };
      jest
        .spyOn(videoModel, 'findOne')
        .mockReturnValue(
          mockQuery(video) as ReturnType<typeof videoModel.findOne>,
        );
      jest
        .spyOn(sectionModel, 'findById')
        .mockReturnValue(
          mockQuery(null) as ReturnType<typeof sectionModel.findById>,
        );

      await expect(
        service.completeVideo('adminId', mockVideoId.toString(), mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not crash if event emission fails', async () => {
      const video = {
        _id: mockVideoId,
        sectionId: mockSectionId,
        durationSeconds: 120,
      };
      const section = { _id: mockSectionId, courseId: mockCourseId };
      jest
        .spyOn(videoModel, 'findOne')
        .mockReturnValue(
          mockQuery(video) as ReturnType<typeof videoModel.findOne>,
        );
      jest
        .spyOn(sectionModel, 'findById')
        .mockReturnValue(
          mockQuery(section) as ReturnType<typeof sectionModel.findById>,
        );
      jest
        .spyOn(progressModel, 'findOneAndUpdate')
        .mockReturnValue(
          mockQuery({}) as ReturnType<typeof progressModel.findOneAndUpdate>,
        );
      jest
        .spyOn(progressionService, 'evaluateStudentLevel')
        .mockResolvedValue(CourseLevel.Beginner);
      jest
        .spyOn(eventEmitter, 'emitAsync')
        .mockRejectedValue(new Error('emit failed'));

      const result = await service.completeVideo(
        'adminId',
        mockVideoId.toString(),
        mockUserId,
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('completeCourse', () => {
    it('should complete all videos in a course', async () => {
      const course = { _id: mockCourseId, deletedAt: null };
      const user = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Beginner,
      };
      const sections = [{ _id: mockSectionId }];
      const videos = [{ _id: mockVideoId, durationSeconds: 120 }];

      jest
        .spyOn(courseModel, 'findOne')
        .mockReturnValue(
          mockQuery(course) as ReturnType<typeof courseModel.findOne>,
        );
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(user) as ReturnType<typeof userModel.findById>,
        );
      jest
        .spyOn(membershipModel, 'findOneAndUpdate')
        .mockReturnValue(
          mockQuery({}) as ReturnType<typeof membershipModel.findOneAndUpdate>,
        );
      jest
        .spyOn(sectionModel, 'find')
        .mockReturnValue(
          mockSelectQuery(sections) as ReturnType<typeof sectionModel.find>,
        );
      jest
        .spyOn(videoModel, 'find')
        .mockReturnValue(
          mockSelectQuery(videos) as ReturnType<typeof videoModel.find>,
        );
      jest
        .spyOn(progressModel, 'findOneAndUpdate')
        .mockReturnValue(
          mockQuery({}) as ReturnType<typeof progressModel.findOneAndUpdate>,
        );
      jest
        .spyOn(progressionService, 'evaluateStudentLevel')
        .mockResolvedValue(CourseLevel.Beginner);

      const result = await service.completeCourse(
        'adminId',
        mockCourseId.toString(),
        mockUserId,
      );

      expect(result).toEqual({ courseCompleted: true, levelChanged: false });
    });

    it('should detect level change', async () => {
      const course = { _id: mockCourseId, deletedAt: null };
      const user = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Beginner,
      };
      const sections = [{ _id: mockSectionId }];
      const videos = [{ _id: mockVideoId, durationSeconds: 120 }];

      jest
        .spyOn(courseModel, 'findOne')
        .mockReturnValue(
          mockQuery(course) as ReturnType<typeof courseModel.findOne>,
        );
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(user) as ReturnType<typeof userModel.findById>,
        );
      jest
        .spyOn(membershipModel, 'findOneAndUpdate')
        .mockReturnValue(
          mockQuery({}) as ReturnType<typeof membershipModel.findOneAndUpdate>,
        );
      jest
        .spyOn(sectionModel, 'find')
        .mockReturnValue(
          mockSelectQuery(sections) as ReturnType<typeof sectionModel.find>,
        );
      jest
        .spyOn(videoModel, 'find')
        .mockReturnValue(
          mockSelectQuery(videos) as ReturnType<typeof videoModel.find>,
        );
      jest
        .spyOn(progressModel, 'findOneAndUpdate')
        .mockReturnValue(
          mockQuery({}) as ReturnType<typeof progressModel.findOneAndUpdate>,
        );
      jest
        .spyOn(progressionService, 'evaluateStudentLevel')
        .mockResolvedValue(CourseLevel.Intermediate);

      const result = await service.completeCourse(
        'adminId',
        mockCourseId.toString(),
        mockUserId,
      );
      expect(result).toEqual({ courseCompleted: true, levelChanged: true });
    });

    it('should throw if course not found', async () => {
      jest
        .spyOn(courseModel, 'findOne')
        .mockReturnValue(
          mockQuery(null) as ReturnType<typeof courseModel.findOne>,
        );

      await expect(
        service.completeCourse('adminId', mockCourseId.toString(), mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('completeLevel', () => {
    it('should complete all courses in a level', async () => {
      const courses = [{ _id: mockCourseId }];
      const user = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Intermediate,
      };

      jest
        .spyOn(courseModel, 'find')
        .mockReturnValue(
          mockSelectQuery(courses) as ReturnType<typeof courseModel.find>,
        );
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(user) as ReturnType<typeof userModel.findById>,
        );

      const course = { _id: mockCourseId, deletedAt: null };
      jest
        .spyOn(courseModel, 'findOne')
        .mockReturnValue(
          mockQuery(course) as ReturnType<typeof courseModel.findOne>,
        );
      jest
        .spyOn(membershipModel, 'findOneAndUpdate')
        .mockReturnValue(
          mockQuery({}) as ReturnType<typeof membershipModel.findOneAndUpdate>,
        );
      jest
        .spyOn(sectionModel, 'find')
        .mockReturnValue(
          mockSelectQuery([]) as ReturnType<typeof sectionModel.find>,
        );
      jest
        .spyOn(videoModel, 'find')
        .mockReturnValue(
          mockSelectQuery([]) as ReturnType<typeof videoModel.find>,
        );
      jest
        .spyOn(progressionService, 'evaluateStudentLevel')
        .mockResolvedValue(CourseLevel.Intermediate);

      const result = await service.completeLevel(
        'adminId',
        CourseLevel.Beginner,
        mockUserId,
      );

      expect(result.completedCourses).toBe(1);
      expect(result.newLevel).toBe(CourseLevel.Intermediate);
    });
  });

  describe('setLevel', () => {
    it('should update user level', async () => {
      const user = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Beginner,
        save: jest.fn().mockResolvedValue(true),
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(user) as ReturnType<typeof userModel.findById>,
        );

      const result = await service.setLevel(
        'adminId',
        mockUserId,
        CourseLevel.Advanced,
      );

      expect(result).toEqual({
        previousLevel: CourseLevel.Beginner,
        newLevel: CourseLevel.Advanced,
      });
      expect(user.save).toHaveBeenCalled();
    });

    it('should throw if user not found', async () => {
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(null) as ReturnType<typeof userModel.findById>,
        );

      await expect(
        service.setLevel('adminId', mockUserId, CourseLevel.Advanced),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('setTrack', () => {
    it('should update user track', async () => {
      const user: Record<string, unknown> = {
        _id: new Types.ObjectId(mockUserId),
        selectedTrackId: null,
        save: jest.fn().mockResolvedValue(true),
      };
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(user) as ReturnType<typeof userModel.findById>,
        );

      const result = await service.setTrack(
        'adminId',
        mockUserId,
        mockTrackId.toString(),
      );

      expect(result).toEqual({ success: true });
      expect((user.selectedTrackId as Types.ObjectId | null)?.toString()).toBe(
        mockTrackId.toString(),
      );
      expect(user.save).toHaveBeenCalled();
    });

    it('should throw if user not found', async () => {
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(null) as ReturnType<typeof userModel.findById>,
        );

      await expect(
        service.setTrack('adminId', mockUserId, mockTrackId.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resetProgress', () => {
    it('should delete progress, memberships, and reset user', async () => {
      jest
        .spyOn(progressModel, 'deleteMany')
        .mockReturnValue(
          mockQuery({ deletedCount: 5 }) as ReturnType<
            typeof progressModel.deleteMany
          >,
        );
      jest
        .spyOn(membershipModel, 'deleteMany')
        .mockReturnValue(
          mockQuery({ deletedCount: 3 }) as ReturnType<
            typeof membershipModel.deleteMany
          >,
        );
      jest
        .spyOn(userModel, 'findByIdAndUpdate')
        .mockReturnValue(
          mockQuery({}) as ReturnType<typeof userModel.findByIdAndUpdate>,
        );

      const result = await service.resetProgress('adminId', mockUserId);

      expect(result).toEqual({ reset: true });
      expect(jest.spyOn(progressModel, 'deleteMany')).toHaveBeenCalled();
      expect(jest.spyOn(membershipModel, 'deleteMany')).toHaveBeenCalled();
      expect(jest.spyOn(userModel, 'findByIdAndUpdate')).toHaveBeenCalledWith(
        mockUserId,
        {
          currentLevel: CourseLevel.Beginner,
          selectedTrackId: null,
        },
      );
    });
  });
});
