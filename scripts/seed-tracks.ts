import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { Track } from '../src/modules/courses/schemas/track.schema';
import { Course } from '../src/modules/courses/schemas/course.schema';
import { CourseLevel } from '../src/modules/courses/enums/course.enums';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface TrackDef {
  name: string;
  description: string;
}

const TRACKS: TrackDef[] = [
  {
    name: 'AI',
    description:
      'Focuses on intelligent systems, machine learning, deep learning, computer vision, natural language processing, and modern AI applications.',
  },
  {
    name: 'Systems',
    description:
      'Focuses on operating systems, distributed systems, cloud computing, networking, databases, and large-scale software infrastructure.',
  },
  {
    name: 'Theory',
    description:
      'Focuses on algorithms, data structures, computational complexity, cryptography, automata theory, and the mathematical foundations of computing.',
  },
  {
    name: 'HCI',
    description:
      'Focuses on Human-Computer Interaction, user experience, user interface design, usability, accessibility, and interactive technologies.',
  },
  {
    name: 'Visual Computing',
    description:
      'Focuses on computer graphics, computer vision, image processing, virtual reality, augmented reality, and visual data analysis.',
  },
  {
    name: 'Information',
    description:
      'Focuses on data management, information retrieval, data analytics, knowledge systems, business intelligence, and information technologies.',
  },
  {
    name: 'Biocomputation',
    description:
      'Focuses on bioinformatics, computational biology, healthcare technologies, biological data analysis, and AI applications in life sciences.',
  },
  {
    name: 'Computer Engineering',
    description:
      'Focuses on embedded systems, computer architecture, digital design, microprocessors, hardware-software integration, and IoT systems.',
  },
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const trackModel = app.get<Model<Track>>(getModelToken(Track.name));
    const courseModel = app.get<Model<Course>>(getModelToken(Course.name));

    let tracksCreated = 0;
    let coursesUpdated = 0;

    console.log('--- Seeding Tracks ---\n');

    for (const def of TRACKS) {
      const slug = slugify(def.name);
      const existing = await trackModel.findOne({ slug }).exec();

      if (existing) {
        console.log(
          `  ~ ${def.name} (already exists, id=${existing._id.toString()})`,
        );
      } else {
        const track = await trackModel.create({
          name: def.name,
          slug,
          description: def.description,
          isActive: true,
        });
        console.log(`  + ${def.name} (id=${track._id.toString()})`);
        tracksCreated++;
      }
    }

    console.log(
      `\nTracks: ${tracksCreated} created, ${TRACKS.length - tracksCreated} already existed.\n`,
    );

    // -----------------------------------------------------------------------
    // Phase 2: Optionally link existing Advanced/Expert courses to tracks
    // -----------------------------------------------------------------------
    console.log('--- Linking Advanced/Expert courses to tracks ---\n');

    const allTracks = await trackModel.find().lean().exec();
    const trackByName = new Map(allTracks.map((t) => [t.name, t._id]));

    for (const [trackName, trackId] of trackByName) {
      const slug = slugify(trackName);
      const result = await courseModel
        .updateMany(
          {
            level: { $in: [CourseLevel.Advanced, CourseLevel.Expert] },
            $or: [
              {
                title: {
                  $regex: trackName.split(' ').slice(0, 2).join('|'),
                  $options: 'i',
                },
              },
              {
                slug: {
                  $regex: slug.split('-').slice(0, 2).join('|'),
                  $options: 'i',
                },
              },
              {
                courseCode: {
                  $regex: trackName.substring(0, 4),
                  $options: 'i',
                },
              },
            ],
            trackId: null,
          },
          { $set: { trackId } },
        )
        .exec();

      if (result.modifiedCount > 0) {
        console.log(
          `  → Linked ${result.modifiedCount} courses to "${trackName}"`,
        );
        coursesUpdated += result.modifiedCount;
      }
    }

    const unlinked = await courseModel
      .countDocuments({
        level: { $in: [CourseLevel.Advanced, CourseLevel.Expert] },
        trackId: null,
        isActive: true,
        deletedAt: null,
      })
      .exec();

    if (unlinked > 0) {
      console.log(
        `\n  ⚠ ${unlinked} Advanced/Expert courses still lack a trackId`,
      );
      console.log('  Run manually or update courses via PATCH /courses/:id');
    }

    console.log(
      `\nDone. ${tracksCreated} tracks created, ${coursesUpdated} courses linked.`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
