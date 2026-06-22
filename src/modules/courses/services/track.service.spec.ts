import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TrackService } from './track.service';
import { Track, TrackDocument } from '../schemas/track.schema';
import { User } from '@modules/auth/schemas/user.schema';
import { CourseLevel, CourseEventType } from '../enums/course.enums';

function mockQuery<T>(returnValue: T): unknown {
  return { exec: jest.fn<Promise<T>, []>().mockResolvedValue(returnValue) };
}

function mockFind<T>(returnValue: T[]): unknown {
  return {
    sort: jest.fn().mockReturnValue({
      exec: jest.fn<Promise<T[]>, []>().mockResolvedValue(returnValue),
    }),
  };
}

describe('TrackService', () => {
  let service: TrackService;
  let trackModel: Model<Track>;
  let userModel: Model<User>;
  let eventEmitter: EventEmitter2;

  const mockTrackId = new Types.ObjectId();
  const mockUserId = new Types.ObjectId().toString();

  const mockTrackDoc = {
    _id: mockTrackId,
    name: 'Backend Development',
    slug: 'backend-development',
    description: '',
    isActive: true,
    save: jest.fn().mockResolvedValue(true),
  } as unknown as TrackDocument;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrackService,
        {
          provide: getModelToken(Track.name),
          useValue: {
            find: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getModelToken(User.name),
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

    service = module.get<TrackService>(TrackService);
    trackModel = module.get<Model<Track>>(getModelToken(Track.name));
    userModel = module.get<Model<User>>(getModelToken(User.name));
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return active tracks sorted by name', async () => {
      const tracks = [mockTrackDoc];
      const findSpy = jest
        .spyOn(trackModel, 'find')
        .mockReturnValue(
          mockFind(tracks) as ReturnType<typeof trackModel.find>,
        );

      const result = await service.findAll();
      expect(result).toEqual(tracks);
      expect(findSpy).toHaveBeenCalledWith({
        isActive: true,
      });
    });
  });

  describe('findById', () => {
    it('should return track when found', async () => {
      jest
        .spyOn(trackModel, 'findById')
        .mockReturnValue(
          mockQuery(mockTrackDoc) as ReturnType<typeof trackModel.findById>,
        );

      const result = await service.findById(mockTrackId.toString());
      expect(result).toEqual(mockTrackDoc);
    });

    it('should throw on invalid ObjectId', async () => {
      await expect(service.findById('invalid')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFound when track missing', async () => {
      jest
        .spyOn(trackModel, 'findById')
        .mockReturnValue(
          mockQuery(null) as ReturnType<typeof trackModel.findById>,
        );

      await expect(service.findById(mockTrackId.toString())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a track', async () => {
      const data = {
        name: 'Test Track',
        slug: 'test-track',
        description: 'desc',
      };
      const createSpy = (
        jest.spyOn(trackModel, 'create') as unknown as jest.Mock<
          Promise<TrackDocument>
        >
      ).mockResolvedValue(mockTrackDoc);

      const result = await service.create(data);
      expect(result).toEqual(mockTrackDoc);
      expect(createSpy).toHaveBeenCalledWith({
        name: 'Test Track',
        slug: 'test-track',
        description: 'desc',
        isActive: true,
      });
    });

    it('should create with default empty description', async () => {
      const data = { name: 'Test Track', slug: 'test-track' };
      const createSpy = (
        jest.spyOn(trackModel, 'create') as unknown as jest.Mock<
          Promise<TrackDocument>
        >
      ).mockResolvedValue(mockTrackDoc);

      await service.create(data);
      expect(createSpy).toHaveBeenCalledWith({
        name: 'Test Track',
        slug: 'test-track',
        description: '',
        isActive: true,
      });
    });
  });

  describe('update', () => {
    it('should update track fields', async () => {
      const saveMock = jest.fn().mockResolvedValue(true);
      const track = { ...mockTrackDoc, save: saveMock };
      jest
        .spyOn(trackModel, 'findById')
        .mockReturnValue(
          mockQuery(track) as ReturnType<typeof trackModel.findById>,
        );

      await service.update(mockTrackId.toString(), {
        name: 'Updated',
        description: 'New desc',
      });

      expect(track.name).toBe('Updated');
      expect(track.description).toBe('New desc');
      expect(saveMock).toHaveBeenCalled();
    });

    it('should deactivate track', async () => {
      const saveMock = jest.fn().mockResolvedValue(true);
      const track = { ...mockTrackDoc, save: saveMock };
      jest
        .spyOn(trackModel, 'findById')
        .mockReturnValue(
          mockQuery(track) as ReturnType<typeof trackModel.findById>,
        );

      await service.update(mockTrackId.toString(), { isActive: false });
      expect(track.isActive).toBe(false);
      expect(saveMock).toHaveBeenCalled();
    });
  });

  describe('selectTrack', () => {
    const mockUser = {
      id: mockUserId,
      email: 'test@test.com',
      username: 'test',
      role: 'student',
      roleId: '',
      permissions: [],
      reputationScore: 0,
      githubLinked: false,
      emailVerified: false,
      preferences: {},
    };

    it('should select track for an Advanced-level user', async () => {
      const saveMock = jest.fn().mockResolvedValue(true);
      const userDoc = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Advanced,
        selectedTrackId: null,
        save: saveMock,
      };

      jest
        .spyOn(trackModel, 'findById')
        .mockReturnValue(
          mockQuery(mockTrackDoc) as ReturnType<typeof trackModel.findById>,
        );
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(userDoc) as ReturnType<typeof userModel.findById>,
        );

      await service.selectTrack(mockUser, mockTrackId.toString());

      expect(
        (
          userDoc as { selectedTrackId: Types.ObjectId | null }
        ).selectedTrackId?.toString(),
      ).toBe(mockTrackId.toString());
      expect(saveMock).toHaveBeenCalled();
      const emitSpy = jest.spyOn(eventEmitter, 'emitAsync');
      expect(emitSpy).toHaveBeenCalledWith(
        CourseEventType.TrackSelected,
        expect.objectContaining({
          userId: mockUserId,
          trackId: mockTrackId.toString(),
        }),
      );
    });

    it('should reject if track not found', async () => {
      jest
        .spyOn(trackModel, 'findById')
        .mockReturnValue(
          mockQuery(null) as ReturnType<typeof trackModel.findById>,
        );

      await expect(
        service.selectTrack(mockUser, mockTrackId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject if user already selected a track', async () => {
      const userDoc = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Advanced,
        selectedTrackId: new Types.ObjectId(),
      };

      jest
        .spyOn(trackModel, 'findById')
        .mockReturnValue(
          mockQuery(mockTrackDoc) as ReturnType<typeof trackModel.findById>,
        );
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(userDoc) as ReturnType<typeof userModel.findById>,
        );

      await expect(
        service.selectTrack(mockUser, mockTrackId.toString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if user has not completed Intermediate', async () => {
      const userDoc = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Beginner,
        selectedTrackId: null,
      };

      jest
        .spyOn(trackModel, 'findById')
        .mockReturnValue(
          mockQuery(mockTrackDoc) as ReturnType<typeof trackModel.findById>,
        );
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(userDoc) as ReturnType<typeof userModel.findById>,
        );

      await expect(
        service.selectTrack(mockUser, mockTrackId.toString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle event emission failure gracefully', async () => {
      const saveMock = jest.fn().mockResolvedValue(true);
      const userDoc = {
        _id: new Types.ObjectId(mockUserId),
        currentLevel: CourseLevel.Advanced,
        selectedTrackId: null,
        save: saveMock,
      };

      jest
        .spyOn(trackModel, 'findById')
        .mockReturnValue(
          mockQuery(mockTrackDoc) as ReturnType<typeof trackModel.findById>,
        );
      jest
        .spyOn(userModel, 'findById')
        .mockReturnValue(
          mockQuery(userDoc) as ReturnType<typeof userModel.findById>,
        );
      jest
        .spyOn(eventEmitter, 'emitAsync')
        .mockRejectedValue(new Error('fail'));

      await expect(
        service.selectTrack(mockUser, mockTrackId.toString()),
      ).resolves.toBeUndefined();
    });
  });
});
