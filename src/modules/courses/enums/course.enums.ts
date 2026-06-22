export enum CourseRole {
  Student = 'student',
  Instructor = 'instructor',
  Ta = 'ta',
}

export enum EnrollmentRequestStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
}

export enum AssignmentType {
  Text = 'text',
  Mcq = 'mcq',
  Quiz = 'quiz',
  Code = 'code',
  Project = 'project',
}

export enum AssignmentSubmissionStatus {
  Draft = 'draft',
  Submitted = 'submitted',
  Graded = 'graded',
}

export enum TestCaseResultStatus {
  Pass = 'pass',
  Fail = 'fail',
  Error = 'error',
  TimeLimitExceeded = 'tle',
  MemoryLimitExceeded = 'mle',
}

export enum CourseLevel {
  Beginner = 'beginner',
  Intermediate = 'intermediate',
  Advanced = 'advanced',
  Expert = 'expert',
}

export enum CourseEventType {
  TrackSelected = 'TRACK_SELECTED',
  LevelCompleted = 'LEVEL_COMPLETED',
  LevelUnlocked = 'LEVEL_UNLOCKED',
}
