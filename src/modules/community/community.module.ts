import {
  Module,
  OnApplicationBootstrap,
  Optional,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ModuleRef } from '@nestjs/core';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '@modules/auth/auth.module';
import { CoursesModule } from '@modules/courses/courses.module';
import { GamificationModule } from '@modules/gamification/gamification.module';
import { ActivityEventService } from '@modules/gamification/services/activity-event.service';
import { Thread, ThreadSchema } from './schemas/thread.schema';
import { Post, PostSchema } from './schemas/post.schema';
import { Question, QuestionSchema } from './schemas/question.schema';
import { Answer, AnswerSchema } from './schemas/answer.schema';
import { Tag, TagSchema } from './schemas/tag.schema';
import { Vote, VoteSchema } from './schemas/vote.schema';
import { Flag, FlagSchema } from './schemas/flag.schema';
import {
  QuestionBookmark,
  QuestionBookmarkSchema,
} from './schemas/question-bookmark.schema';
import { ThreadService } from './services/thread.service';
import { PostService } from './services/post.service';
import { QuestionService } from './services/question.service';
import { AnswerService } from './services/answer.service';
import { TagService } from './services/tag.service';
import { VoteService } from './services/vote.service';
import { FlagService } from './services/flag.service';
import { ChatbotService } from './services/chatbot.service';
import { CourseService } from './services/course.service';
import { NoopNotificationService } from './services/noop-services';
import { CommunityGateway } from './gateways/community.gateway';
import { ThreadController } from './controllers/thread.controller';
import { PostController } from './controllers/post.controller';
import { QuestionController } from './controllers/question.controller';
import { AnswerController } from './controllers/answer.controller';
import { TagController } from './controllers/tag.controller';
import { VoteController } from './controllers/vote.controller';
import { FlagController } from './controllers/flag.controller';
import { ChatbotController } from './controllers/chatbot.controller';
import {
  REALTIME_EVENTS,
  ACTIVITY_EVENT_SERVICE,
  NOTIFICATION_SERVICE,
} from './community.tokens';
import type {
  IRealtimeEvents,
  IActivityEventService,
  INotificationService,
} from './interfaces/external-services.interface';

@Module({
  imports: [
    forwardRef(() => GamificationModule),
    AuthModule,
    CoursesModule,
    MongooseModule.forFeature([
      { name: Thread.name, schema: ThreadSchema },
      { name: Post.name, schema: PostSchema },
      { name: Question.name, schema: QuestionSchema },
      { name: Answer.name, schema: AnswerSchema },
      { name: Tag.name, schema: TagSchema },
      { name: Vote.name, schema: VoteSchema },
      { name: Flag.name, schema: FlagSchema },
      { name: QuestionBookmark.name, schema: QuestionBookmarkSchema },
    ]),
    HttpModule,
  ],
  controllers: [
    ThreadController,
    PostController,
    QuestionController,
    AnswerController,
    TagController,
    VoteController,
    FlagController,
    ChatbotController,
  ],
  providers: [
    ThreadService,
    PostService,
    QuestionService,
    AnswerService,
    TagService,
    VoteService,
    FlagService,
    ChatbotService,
    CourseService,
    CommunityGateway,
    { provide: REALTIME_EVENTS, useExisting: CommunityGateway },
    { provide: ACTIVITY_EVENT_SERVICE, useClass: ActivityEventService },
    { provide: NOTIFICATION_SERVICE, useClass: NoopNotificationService },
  ],
  exports: [
    TagService,
    ThreadService,
    PostService,
    QuestionService,
    AnswerService,
    VoteService,
  ],
})
export class CommunityModule implements OnApplicationBootstrap {
  constructor(
    private moduleRef: ModuleRef,
    @Optional()
    @Inject(REALTIME_EVENTS)
    private realtimeEvents?: IRealtimeEvents,
    @Optional()
    @Inject(ACTIVITY_EVENT_SERVICE)
    private activityEventService?: IActivityEventService,
    @Optional()
    @Inject(NOTIFICATION_SERVICE)
    private notificationService?: INotificationService,
  ) {}

  onApplicationBootstrap() {
    const threadService = this.moduleRef.get(ThreadService);
    const postService = this.moduleRef.get(PostService);
    const questionService = this.moduleRef.get(QuestionService);
    const answerService = this.moduleRef.get(AnswerService);
    const voteService = this.moduleRef.get(VoteService);

    if (this.realtimeEvents) {
      threadService.setRealtimeEvents(this.realtimeEvents);
      postService.setRealtimeEvents(this.realtimeEvents);
      questionService.setRealtimeEvents(this.realtimeEvents);
      answerService.setRealtimeEvents(this.realtimeEvents);
      voteService.setRealtimeEvents(this.realtimeEvents);
    }
    if (this.activityEventService) {
      threadService.setActivityEventService(this.activityEventService);
      questionService.setActivityEventService(this.activityEventService);
      answerService.setActivityEventService(this.activityEventService);
      voteService.setActivityEventService(this.activityEventService);
    }
    if (this.notificationService) {
      answerService.setNotificationService(this.notificationService);
      voteService.setNotificationService(this.notificationService);
    }
  }
}
