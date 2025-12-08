import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const connectionConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'institute_exams',
  multipleStatements: true
};

// Sample data
const examCategories = [
  { name: 'TNPSC Group I', slug: 'tnpsc-group-i', description: 'Tamil Nadu Public Service Commission Group I', color: '#3B82F6' },
  { name: 'TNPSC Group II', slug: 'tnpsc-group-ii', description: 'Tamil Nadu Public Service Commission Group II', color: '#10B981' },
  { name: 'TNPSC Group IV', slug: 'tnpsc-group-iv', description: 'Tamil Nadu Public Service Commission Group IV', color: '#F59E0B' },
  { name: 'Banking', slug: 'banking', description: 'Banking Exams (IBPS, SBI, RRB)', color: '#EF4444' },
  { name: 'Railway', slug: 'railway', description: 'Railway Recruitment Board Exams', color: '#8B5CF6' },
  { name: 'SSC', slug: 'ssc', description: 'Staff Selection Commission Exams', color: '#EC4899' },
  { name: 'Police/Defence', slug: 'police-defence', description: 'Police and Defence Exams', color: '#14B8A6' },
];

const testSeries = [
  { category: 'TNPSC Group I', title: 'TNPSC Group I Prelims Mock Test Series', description: 'Complete mock test series for TNPSC Group I Prelims', total_tests: 10, is_free: true },
  { category: 'TNPSC Group II', title: 'TNPSC Group II Mock Test Series', description: 'Comprehensive test series for TNPSC Group II', total_tests: 8, is_free: true },
  { category: 'Banking', title: 'Banking PO Mock Test Series', description: 'Mock tests for Banking PO exams', total_tests: 15, is_free: false },
  { category: 'Railway', title: 'RRB NTPC Mock Test Series', description: 'Mock tests for Railway NTPC', total_tests: 12, is_free: true },
];

const studyMaterials = [
  { category: 'TNPSC Group I', title: 'TNPSC Group I History Notes', description: 'Complete history notes for TNPSC Group I', material_type: 'pdf' },
  { category: 'TNPSC Group I', title: 'TNPSC Group I Geography Notes', description: 'Comprehensive geography notes', material_type: 'pdf' },
  { category: 'Banking', title: 'Banking Awareness Guide', description: 'Complete banking awareness guide', material_type: 'pdf' },
  { category: 'Railway', title: 'Railway General Knowledge', description: 'GK notes for Railway exams', material_type: 'pdf' },
];

async function seedDatabase() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database...');
    connection = await mysql.createConnection(connectionConfig);
    console.log('✅ Connected to database');

    // 1. Seed Exam Categories
    console.log('\n📚 Seeding exam categories...');
    for (const category of examCategories) {
      await connection.execute(
        `INSERT INTO exam_categories (name, slug, description, color, display_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=name`,
        [category.name, category.slug, category.description, category.color, examCategories.indexOf(category), true]
      );
    }
    console.log(`✅ Inserted ${examCategories.length} exam categories`);

    // 2. Get category IDs
    const [categories] = await connection.execute('SELECT id, name FROM exam_categories');
    const categoryMap = {};
    categories.forEach(cat => {
      categoryMap[cat.name] = cat.id;
    });

    // 3. Seed Test Series
    console.log('\n📝 Seeding test series...');
    for (const series of testSeries) {
      const categoryId = categoryMap[series.category];
      if (categoryId) {
        await connection.execute(
          `INSERT INTO test_series (category_id, title, description, total_tests, is_free, is_active, display_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE title=title`,
          [categoryId, series.title, series.description, series.total_tests, series.is_free, true, testSeries.indexOf(series)]
        );
      }
    }
    console.log(`✅ Inserted ${testSeries.length} test series`);

    // 4. Get test series IDs and create mock tests
    const [seriesList] = await connection.execute('SELECT id, title FROM test_series');
    console.log('\n🎯 Creating mock tests...');
    let mockTestCount = 0;
    
    for (const series of seriesList) {
      // Create 2-3 mock tests per series
      const testCount = Math.floor(Math.random() * 2) + 2;
      for (let i = 1; i <= testCount; i++) {
        const examCode = `TEST-${series.id}-${i}`;
        await connection.execute(
          `INSERT INTO mock_tests (test_series_id, title, exam_code, description, total_questions, duration_minutes, total_marks, passing_marks, is_active, display_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE title=title`,
          [
            series.id,
            `${series.title} - Test ${i}`,
            examCode,
            `Mock test ${i} for ${series.title}`,
            50,
            60,
            100,
            40,
            true,
            i
          ]
        );
        mockTestCount++;
      }
    }
    console.log(`✅ Created ${mockTestCount} mock tests`);

    // 5. Seed Study Materials
    console.log('\n📚 Seeding study materials...');
    for (const material of studyMaterials) {
      const categoryId = categoryMap[material.category];
      if (categoryId) {
        await connection.execute(
          `INSERT INTO study_materials (category_id, title, description, material_type, file_url, is_active, display_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE title=title`,
          [
            categoryId,
            material.title,
            material.description,
            material.material_type,
            `/materials/${material.material_type}/${material.title.toLowerCase().replace(/\s+/g, '-')}.pdf`,
            true,
            studyMaterials.indexOf(material)
          ]
        );
      }
    }
    console.log(`✅ Inserted ${studyMaterials.length} study materials`);

    // 6. Create sample daily practice questions
    console.log('\n💪 Creating daily practice questions...');
    const topics = ['History', 'Geography', 'Polity', 'Economics', 'Science', 'Current Affairs'];
    let questionCount = 0;
    
    for (let day = 0; day < 30; day++) {
      const practiceDate = new Date();
      practiceDate.setDate(practiceDate.getDate() - day);
      const dateStr = practiceDate.toISOString().split('T')[0];
      
      for (let i = 0; i < 5; i++) {
        const topic = topics[Math.floor(Math.random() * topics.length)];
        await connection.execute(
          `INSERT INTO daily_practice_questions (practice_date, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, topic, difficulty_level, marks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE question_text=question_text`,
          [
            dateStr,
            `Sample question ${i + 1} for ${topic} on ${dateStr}`,
            'Option A',
            'Option B',
            'Option C',
            'Option D',
            'A',
            `Explanation for question ${i + 1}`,
            topic,
            'medium',
            1
          ]
        );
        questionCount++;
      }
    }
    console.log(`✅ Created ${questionCount} daily practice questions`);

    // 7. Create sample badges
    console.log('\n🏆 Creating badges...');
    const badges = [
      { name: 'First Test', description: 'Complete your first mock test', badge_type: 'achievement', icon: '🎯' },
      { name: 'Perfect Score', description: 'Score 100% in any test', badge_type: 'achievement', icon: '⭐' },
      { name: 'Week Warrior', description: 'Complete 7 practice sessions in a week', badge_type: 'streak', icon: '🔥' },
      { name: 'Month Master', description: 'Complete 30 practice sessions in a month', badge_type: 'streak', icon: '👑' },
      { name: 'Top Performer', description: 'Rank in top 10 of leaderboard', badge_type: 'leaderboard', icon: '🏅' },
    ];
    
    for (const badge of badges) {
      await connection.execute(
        `INSERT INTO badges (name, description, badge_type, icon, is_active)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=name`,
        [badge.name, badge.description, badge.badge_type, badge.icon, true]
      );
    }
    console.log(`✅ Created ${badges.length} badges`);

    // 8. Create sample learning paths
    console.log('\n🎓 Creating learning paths...');
    const learningPaths = [
      { title: 'TNPSC Group I Complete Guide', description: 'Complete learning path for TNPSC Group I', difficulty_level: 'advanced' },
      { title: 'Banking Exam Preparation', description: 'Step-by-step guide for banking exams', difficulty_level: 'intermediate' },
      { title: 'Railway Exam Basics', description: 'Beginner guide for Railway exams', difficulty_level: 'beginner' },
    ];
    
    for (const path of learningPaths) {
      await connection.execute(
        `INSERT INTO learning_paths (title, description, difficulty_level, is_active, display_order)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title=title`,
        [path.title, path.description, path.difficulty_level, true, learningPaths.indexOf(path)]
      );
    }
    console.log(`✅ Created ${learningPaths.length} learning paths`);

    // 9. Create sample announcements
    console.log('\n📢 Creating announcements...');
    const announcements = [
      { title: 'New Test Series Available', content: 'Check out our new TNPSC Group I mock test series!', priority: 'high' },
      { title: 'Daily Practice Questions', content: 'New daily practice questions added every day!', priority: 'medium' },
      { title: 'Study Materials Updated', content: 'Latest study materials for all exams now available', priority: 'low' },
    ];
    
    for (const announcement of announcements) {
      await connection.execute(
        `INSERT INTO announcements (title, content, priority, is_active, created_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE title=title`,
        [announcement.title, announcement.content, announcement.priority, true]
      );
    }
    console.log(`✅ Created ${announcements.length} announcements`);

    console.log('\n✅ Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - ${examCategories.length} Exam Categories`);
    console.log(`   - ${testSeries.length} Test Series`);
    console.log(`   - ${mockTestCount} Mock Tests`);
    console.log(`   - ${studyMaterials.length} Study Materials`);
    console.log(`   - ${questionCount} Daily Practice Questions`);
    console.log(`   - ${badges.length} Badges`);
    console.log(`   - ${learningPaths.length} Learning Paths`);
    console.log(`   - ${announcements.length} Announcements`);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run the seed script
seedDatabase()
  .then(() => {
    console.log('\n🎉 Seeding process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Seeding process failed:', error);
    process.exit(1);
  });

