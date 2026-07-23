/**
 * 华大教育研学管理系统
 * 课程数据与城市配置
 */

// 工具函数：获取当地日期 YYYY-MM-DD（避免 toISOString 的 UTC 偏移）
function todayLocal() { return new Date().toLocaleDateString('sv-SE'); }

// 将 ISO 时间戳转换为当地日期字符串
function isoToLocalDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('sv-SE');
}

// 课程大类（用于深圳等课程较多的城市，按大类筛选）
// 小城市只有1-2门课时自动不显示筛选栏
const COURSE_SERIES = {
  intro:    { name: '科普参观与讲座', icon: '🔬' },
  classic:  { name: '经典实验课',     icon: '🧪' },
  fullday:  { name: '全日研学营',     icon: '🌅' },
  midnight: { name: '午夜实验室',     icon: '🌙' },
  genecode: { name: '基因密码检测',   icon: '🧬' },
};

// 课程分类
const CATEGORIES = {
  visit: { name: '科普参观', color: '#3B82F6' },
  lecture: { name: '科普讲座', color: '#8B5CF6' },
  experiment: { name: '动手实验', color: '#10B981' },
};

// 全部课程列表
const COURSES = [
  {
    id: 1,
    no: '01',
    title: '华大探秘记',
    subtitle: '参观华大时空中心',
    category: 'visit',
    series: 'intro',
    duration: '1-1.5h',
    groupSize: '30-50人/批',
    grade: '小初高',
    price: 100,
    goal: '引领学生深度探索生命科学领域的创新成果与前沿技术，了解华大基因发展历程、人类基因组计划及DNA测序技术等核心内容。',
    content: [
      '华大的起源与发展——参与"人类基因组计划"1%任务的历程',
      '核心技术与创新理念——基因测序技术国产化与"剪刀差"研学产一体化理念',
      '科研成果与社会责任——非典、海啸、新冠疫情中的科研担当，多年生水稻、多宝茄树等突破性成果',
    ],
  },
  {
    id: 2,
    no: '02',
    title: '基因源流',
    subtitle: '揭开生命遗传与溯源的科学密码',
    category: 'lecture',
    series: 'intro',
    duration: '1-1.5h',
    groupSize: '30-50人/批',
    grade: '小初高',
    price: 100,
    goal: '追溯生命遗传的本源，系统梳理基因科学的发展脉络与核心知识，破除基因认知误区，培养科学思辨能力。',
    content: [
      '基因的本源与核心奥秘——基因定义、组成与遗传规律，DNA/染色体/基因的内在关联',
      '基因技术的应用与未来展望——医学诊疗、农业育种、生物制药等领域应用，基因检测、靶向治疗等技术原理及伦理探讨',
    ],
  },
  {
    id: 3,
    no: '03',
    title: '粮食危机：超级水稻',
    subtitle: '了解多年生水稻的前世今生（赠送多年生水稻种植盒教具）',
    category: 'lecture',
    series: 'intro',
    duration: '1-1.5h',
    groupSize: '30-50人/批',
    grade: '小初高',
    price: 150,
    goal: '正视全球粮食安全现状，解读粮食危机成因与应对路径，认识超级多年生水稻的研发背景与核心价值。',
    content: [
      '粮食危机的现状与核心困境——人口增长、耕地紧缺、气候变迁等多重因素影响',
      '超级多年生水稻的核心奥秘与突破——"一次种植、多年收割"核心原理，稳产增收、节约成本、保护耕地生态等突破性成果',
      '现场赠送多年生水稻种植盒教具——把课堂上的多年生水稻带回家，亲手种植、延续课堂所学',
    ],
  },
  {
    id: 4,
    no: '04',
    title: '玩转DNA',
    subtitle: '构建DNA模型',
    category: 'experiment',
    series: 'classic',
    duration: '1-1.5h',
    groupSize: '30-50人/批',
    grade: '小初',
    price: 100,
    goal: '理解DNA的结构、组成和功能，掌握遗传信息传递过程，锻炼动手能力与空间想象力。',
    content: [
      '理论讲解——DNA双螺旋结构、碱基互补配对、转录翻译复制',
      '动手操作——亲手构建专属DNA模型',
      '科学探究——基因与遗传疾病、外貌特征的联系',
    ],
  },
  {
    id: 5,
    no: '05',
    title: '菌落花园',
    subtitle: '配置培养基，培养环境中的细菌',
    category: 'experiment',
    series: 'classic',
    duration: '1-1.5h',
    groupSize: '30-50人/批',
    grade: '小初高',
    price: 150,
    goal: '了解微生物世界基本知识，掌握细菌培养基本技术，培养科学探究能力。',
    content: [
      '理论讲解——列文虎克显微镜观察细菌，微生物来源与杀菌方法',
      '动手操作——配置培养基、样本采集与培养',
      '科学探究——观察细菌生长规律，探究环境因素影响',
    ],
  },
  {
    id: 6,
    no: '06',
    title: '苔藓小世界',
    subtitle: '探索微观生命对极端环境的意义',
    category: 'experiment',
    series: 'classic',
    duration: '1-1.5h',
    groupSize: '30-50人/批',
    grade: '小初高',
    price: 160,
    goal: '理解苔藓植物结构、生命周期及生态价值，认识华大苔藓基因研究贡献，掌握苔藓微景观制作方法。',
    content: [
      '理论讲解——苔藓结构与特征、华大发起国际苔藓基因组联盟故事',
      '动手操作——构建专属苔藓微景观',
      '科学探究——苔藓对极端环境生态保护的意义及产业应用',
    ],
  },
  {
    id: 7,
    no: '07',
    title: '传粉特工档案',
    subtitle: '解开熊蜂的奥秘',
    category: 'experiment',
    series: 'classic',
    duration: '1-1.5h',
    groupSize: '30-50人/批',
    grade: '小初高',
    price: 170,
    goal: '认识熊蜂这种传粉昆虫，了解基因技术如何解开熊蜂奥秘，利用植物创作熊蜂标本。',
    content: [
      '理论讲解——熊蜂结构与特征，华大鉴定高海拔适应基因、培育本土抗病熊蜂品种',
      '动手操作——植物创作熊蜂标本',
      '科学探究——熊蜂与植物共生奥秘，基因研究对生态保护和绿色农业的意义',
    ],
  },
  {
    id: 8,
    no: '08',
    title: '大肠杆菌的秘密',
    subtitle: '细菌DNA粗提',
    category: 'experiment',
    series: 'classic',
    duration: '1-1.5h',
    groupSize: '30-50人/批',
    grade: '小初高',
    price: 170,
    goal: '了解大肠杆菌特点、DNA基本结构与功能，学习从大肠杆菌中提取DNA。',
    content: [
      '理论讲解——大肠杆菌特点及科研应用、DNA双螺旋结构',
      '动手操作——DNA提取实验（细胞破碎、DNA释放、过滤沉淀）',
      '科学探究——探索其他物种DNA提取方法',
    ],
  },
  {
    id: 9,
    no: '09',
    title: '拯救香蕉大作战',
    subtitle: '香蕉DNA提取',
    category: 'experiment',
    series: 'classic',
    duration: '1-1.5h',
    groupSize: '30-50人/批',
    grade: '小初高',
    price: 170,
    goal: '通过水果DNA提取实验，了解DNA基本结构与功能，学习从水果中提取DNA。',
    content: [
      '理论讲解——DNA双螺旋结构与碱基互补配对原则',
      '动手操作——水果DNA提取实验',
      '科学探究——探索不同水果DNA提取方法，思考DNA技术未来发展',
    ],
  },
  {
    id: 10,
    no: '10',
    title: '显微镜下的世界',
    subtitle: '走进微观世界',
    category: 'experiment',
    series: 'classic',
    duration: '1-1.5h',
    groupSize: '30-50人/批',
    grade: '小初高',
    price: 170,
    goal: '围绕动植物细胞结构差异，通过显微镜观察探索细胞形态与功能，学习光学显微镜使用方法。',
    content: [
      '理论讲解——细胞基本概念、动植物细胞差异、显微镜构造与使用',
      '动手操作——观察动植物装片、自制洋葱表皮玻片、绘制标注细胞结构',
      '科学探究——对比动植物细胞形态差异',
    ],
  },
  {
    id: 11,
    no: '11',
    title: '"复活"亿万年前的活化石!',
    subtitle: '观察仙女虾生命周期',
    category: 'experiment',
    series: 'classic',
    duration: '1-1.5h',
    groupSize: '30-50人/批',
    grade: '小初高',
    price: 200,
    goal: '探秘从恐龙时代延续至今的仙女虾，理解"活化石"的生命奥秘与生存智慧，完成孵化与培育全过程。',
    content: [
      '仙女虾基础认知——生物分类地位、休眠卵机制、极端环境适应本领，"活化石"演化生物学意义',
      '动手实验——休眠卵孵化原理与操作，观察记录从孵化到成体的形态变化与生长规律',
    ],
  },
  {
    id: 12,
    no: '12',
    title: '打造你的专属显微镜',
    subtitle: '亲手组装显微镜，观察细胞结构',
    category: 'experiment',
    series: 'classic',
    duration: '1-1.5h',
    groupSize: '30-50人/批',
    grade: '小初高',
    price: 200,
    goal: '学习光学显微镜的构造、原理与使用方法，亲手组装显微镜并观察细胞。',
    content: [
      '理论讲解——细胞概念、动植物细胞差异、显微镜构造与使用、实验安全规范',
      '动手操作——观察动植物装片、绘制标注细胞结构',
      '科学探究——对比动植物细胞形态差异与结构功能关系',
    ],
  },
  {
    id: 13,
    no: '13',
    title: '离心力工坊',
    subtitle: '动手制作离心机模型，完成离心实验',
    category: 'experiment',
    series: 'classic',
    duration: '1-1.5h',
    groupSize: '30-50人/批',
    grade: '小初高',
    price: 220,
    goal: '围绕离心机原理与组装构造，亲手搭建DIY离心机，探索离心分离仪器的核心奥秘。',
    content: [
      '理论讲解——离心力形成机制、固液分离原理、DIY离心机构造解析',
      '动手操作——组装专属DIY离心机（支架、电机、转鼓、线路），完成离心分离实验',
      '科学探究——对比DIY与专业离心机分离效果',
    ],
  },
  {
    id: 14,
    no: '14',
    title: '小小侦探家',
    subtitle: 'DNA指纹图谱',
    category: 'experiment',
    series: 'classic',
    duration: '2-2.5h',
    groupSize: '30-50人/批',
    grade: '小初高',
    price: 280,
    goal: '深入剖析DNA指纹图谱技术的原理、发展历程及在法医学、亲子鉴定、物种鉴别等领域的应用。',
    content: [
      '理论讲解——DNA指纹图谱技术的发现发展、科学原理与应用领域',
      '实验操作与数据分析——琼脂糖凝胶电泳实验，学习DNA样本提取、复制和比对及结果分析',
    ],
  },
  // ===== 以下为深圳专属课程（基因魔方·青少年假日营 + 午夜实验室）=====
  {
    id: 15,
    no: '15',
    title: '极端生命探险记',
    subtitle: '探索珠峰极端环境下的生命奇迹',
    category: 'experiment',
    series: 'fullday',
    duration: '全日（6h）',
    groupSize: '20-30人/批',
    grade: '4-9年级',
    price: '待定',
    goal: '走进珠峰科考场景，探索极端环境生命奇迹，动手采样、培养与鉴定微生物，解锁极限生存的科学奥秘。',
    content: [
      '探索高海拔热泉底泥中的微生物奥秘',
      '解锁极端环境下生命产气密码，感受科研思维与魅力',
      '沉浸体验前沿科技，收获专业级科学探究与发现',
    ],
  },
  {
    id: 16,
    no: '16',
    title: '谜案现场侦查记',
    subtitle: '化身法医，用科学推理破解悬案',
    category: 'experiment',
    series: 'fullday',
    duration: '全日（6h）',
    groupSize: '20-30人/批',
    grade: '4-9年级',
    price: '待定',
    goal: '以珠峰科考站悬案为背景，学习法医侦查、物证提取与生物鉴定，通过科学推理破解谜题，体验真实刑侦探索。',
    content: [
      '采集"案发现场"的指纹等关键物证',
      '使用专业勘察工具提取指纹',
      '形成物证分析报告，初步建立证据链',
    ],
  },
  {
    id: 17,
    no: '17',
    title: '生命密码破译记',
    subtitle: '亲手提取DNA，解读人体遗传密码',
    category: 'experiment',
    series: 'fullday',
    duration: '全日（6h）',
    groupSize: '20-30人/批',
    grade: '7-12年级',
    price: '待定',
    goal: '深入人体生命密码，学习基因科学知识，亲手完成DNA提取与检测，解读个体遗传奥秘，感知生命底层逻辑。',
    content: [
      '解锁专属生命基因密码，探索自身健康特质',
      '依托前沿基因科技，解码身体潜藏的健康奥秘',
      '定制个性化健康指导方案，开启科学健康生活新范式',
    ],
  },
  {
    id: 18,
    no: '18',
    title: '午夜实验室·物种大爆发',
    subtitle: '化身星际生态设计师，让生命在X星球爆发',
    category: 'experiment',
    series: 'midnight',
    duration: '2h',
    groupSize: '15-25人/批',
    grade: '4年级以上',
    price: '待定',
    goal: '化身地外星球生态设计师，穿越4亿年触摸活化石，破译蕨类生存密码，挑战基因编辑，设计生态方舟。',
    content: [
      '星球对接——分析地外星球X星球环境',
      '植物探秘——实验发现活化石生存智慧，制作干枯植物复活标本',
      '先锋选拔——选拔"最小生态先锋队"',
      '基因工坊——应用基因技术设计物种改造方案',
      '提案呈递——呈递生态提案，触发X星球物种大爆发',
    ],
  },
  {
    id: 19,
    no: '19',
    title: '午夜实验室·追踪"黄金"菌',
    subtitle: '从寻香到解码，亲手调制专属植物香水',
    category: 'experiment',
    series: 'midnight',
    duration: '2h',
    groupSize: '15-25人/批',
    grade: '4年级以上',
    price: '待定',
    goal: '走进香味植物的秘密世界，沉浸式体验从寻香到解码的完整科研流程，像科学家一样完成模拟实验，调制专属香水。',
    content: [
      '探秘"植物工厂"——追踪香味来源',
      '拼装基因通路——像搭乐高一样组装基因',
      '破译DNA气味密码——用"密码子转盘"翻译生命代码',
      '识破"黄金"菌——从培养皿中锁定目标',
      '调制专属香水——把独一无二的气味带回家',
    ],
  },
  {
    id: 20,
    no: '20',
    title: '午夜实验室·阴阳编码师',
    subtitle: '化身DNA编码师，拯救地球物种记忆',
    category: 'experiment',
    series: 'midnight',
    duration: '1h',
    groupSize: '15-25人/批',
    grade: '4年级以上',
    price: '待定',
    goal: '警报骤响，地球物种记忆面临消失危机！运用阴阳编码法补全基因映射规则，像真正的编码科学家一样完成生物质检与序列封印。',
    content: [
      '危机触发——进入核心安全区，解读"DNA存储密语"',
      '科学家接头——寻找NPC科学家，获取密钥残页',
      '规则破译——运用阴阳编码法，补全基因映射规则',
      '物种复原——拼出濒危物种拉丁名并转化为DNA序列',
      '终局交付——完成质检，亲手封印序列，获得专属时空胶囊',
    ],
  },
  {
    id: 21,
    no: '21',
    title: '未来农场创造记',
    subtitle: '走进智慧农业，动手打造微型农场',
    category: 'experiment',
    series: 'fullday',
    duration: '全日（6h）',
    groupSize: '20-30人/批',
    grade: '4-9年级',
    price: '待定',
    goal: '带你走进智慧农业世界，学习无土栽培、育种与生态种植，动手打造微型农场，感受科技赋能农业的魅力。',
    content: [
      '智慧农业概览——无土栽培技术、智能温室原理',
      '动手实践——育种实验与生态种植操作',
      '创意设计——亲手打造专属微型农场模型',
    ],
  },
  {
    id: 22,
    no: '22',
    title: '未来工程师诞生记',
    subtitle: '探秘基因测序前沿，动手实操高端设备',
    category: 'experiment',
    series: 'fullday',
    duration: '全日（6h）',
    groupSize: '20-30人/批',
    grade: '7-12年级',
    price: '待定',
    goal: '探秘生命工程前沿，学习基因测序与仪器原理，动手实操高端科研设备，培养科学思维与未来工程师技能。',
    content: [
      '基因测序技术发展史——从一代到三代测序',
      '仪器原理拆解——了解测序仪核心构造与工作流程',
      '动手实操——操作科研设备完成测序任务',
      '工程思维训练——从实验设计到数据分析全流程',
    ],
  },
  // ===== 基因密码系列课程（深圳专属）=====
  {
    id: 23,
    no: '23',
    title: '生命密码破译记——运动基因检测',
    subtitle: '揭秘ACTN3基因，你是天生的耐力型还是爆发型？',
    category: 'experiment',
    series: 'genecode',
    duration: '90-120分钟',
    groupSize: '15-30人/批',
    grade: '初中以上',
    price: '待定',
    goal: '带领学生系统掌握单核苷酸多态性（SNP）的检测原理与分析方法，揭开"运动基因"ACTN3的神秘面纱，通过真实qPCR实验操作理解基因型与运动表现之间的关联。',
    content: [
      '知识层——了解ACTN3基因多态性与爆发力、耐力运动能力的关系',
      '技能层——掌握TaqMan探针法qPCR检测SNP的基本流程',
      '真实验操作——口腔唾液取样，真实qPCR上机检测，1小时完成取样到读型的完整闭环',
      '结果可视化——通过荧光曲线图判读基因型，5分钟看懂自己是爆发力型、耐力型还是均衡型',
      '科学伦理——辩证看待基因与天赋的关系，培养理性运用前沿生物技术的科学素养',
    ],
  },
  {
    id: 24,
    no: '24',
    title: '基因密码之饮食侦探社',
    subtitle: '科学饮食与精准营养：牛奶、咖啡、酒背后的基因密码',
    category: 'experiment',
    series: 'genecode',
    duration: '90-120分钟',
    groupSize: '15-30人/批',
    grade: '初中以上',
    price: '待定',
    goal: '从日常饮食切入基因世界，检测MCM6、CYP1A2、ALDH2三个关键基因位点，揭开乳糖不耐、咖啡因代谢、酒精脸红背后的遗传真相。',
    content: [
      'MCM6基因检测——喝牛奶会不会拉肚子？揭秘乳糖酶持续表达基因',
      'CYP1A2基因检测——早上一杯咖啡是续命还是增压？探秘咖啡因代谢速率',
      'ALDH2基因检测——喝酒会不会脸红？解析乙醛脱氢酶基因变异',
      'qPCR实验操作——亲手完成样本提取、扩增与荧光信号读取',
      '科学讨论——基因检测结果如何指导个性化饮食方案',
    ],
  },
  {
    id: 25,
    no: '25',
    title: '基因密码之身体调色盘',
    subtitle: '肤色、发色、瞳色背后的基因开关',
    category: 'experiment',
    series: 'genecode',
    duration: '90-120分钟',
    groupSize: '15-30人/批',
    grade: '初中以上',
    price: '待定',
    goal: '探索IRF4与OCA2基因如何调控人类外在表型，理解基因多样性背后的科学密码，亲手检测自身基因型并解读"出厂设置"。',
    content: [
      'IRF4基因检测——发色与瞳色调控基因，探索虹膜颜色多样性',
      'OCA2基因检测——眼睛颜色主效基因，揭秘蓝眼/棕眼背后的遗传差异',
      'qPCR实验操作——完成DNA提取、扩增与基因型判读',
      '人类表型多样性——从基因角度理解人群外貌差异的演化意义',
    ],
  },
  {
    id: 26,
    no: '26',
    title: '基因密码之感官实验室',
    subtitle: '味觉与嗅觉的"出厂设置"——香菜、苦味与鲜味',
    category: 'experiment',
    series: 'genecode',
    duration: '90-120分钟',
    groupSize: '15-30人/批',
    grade: '初中以上',
    price: '待定',
    goal: '检测OR6A2、TAS2R38、TAS1R1三个感官基因位点，揭开味觉与嗅觉个体差异背后的遗传密码，探索大熊猫独特味觉的进化故事。',
    content: [
      'OR6A2基因检测——喜不喜欢吃香菜？揭秘香菜气味受体基因变异',
      'TAS2R38基因检测——基因决定了你能不能吃苦？苦味受体基因探秘',
      'TAS1R1基因检测——大熊猫独特的味觉体验：鲜味受体基因的丢失与进化',
      'qPCR实验操作——多基因位点并行检测与数据分析',
      '感官实验——盲测验证基因型与味觉偏好的对应关系',
    ],
  },
  {
    id: 27,
    no: '27',
    title: '基因密码之进化博弈',
    subtitle: '基因定胖与秃——FTO与AR基因的生存博弈',
    category: 'experiment',
    series: 'genecode',
    duration: '90-120分钟',
    groupSize: '15-30人/批',
    grade: '初中以上',
    price: '待定',
    goal: '从进化生物学视角切入，检测FTO与AR两个关键基因，探索代谢调控与脱发背后的遗传因素，理解基因在生存适应中的双面性。',
    content: [
      'FTO基因检测——你的基因是"瘦"还是"易胖"体质？揭秘肥胖风险基因',
      'AR基因检测——探索雄性激素脱发的遗传因素，解析雄激素受体基因多态性',
      'qPCR实验操作——双基因位点检测与基因型分析',
      '进化博弈——从自然选择角度理解"肥胖基因"与"脱发基因"的留存原因',
      '科学讨论——基因检测在健康管理中的应用与伦理思考',
    ],
  },
];

// 午餐服务
const LUNCH = {
  name: '午餐服务（可选）',
  description: '两荤两素+饮料 · 餐厅可容纳700人 · 需提前一天预定',
  price: 30,
};

// 城市配置
// 'all' = 所有课程, 数组 = 指定课程ID列表
// discount = 城市折扣（1=原价, 0.8=8折, 0.9=9折）
const CITIES = {
  '深圳': { courses: 'all', label: '深圳', discount: 1 },
  '武汉': { courses: [1, 2, 3, 9], label: '武汉', discount: 0.8 },
  '杭州': { courses: [1, 2, 3, 9], label: '杭州', discount: 0.9 },
};

// 获取城市折扣（默认1，无折扣）
function getCityDiscount(city) {
  const cfg = CITIES[city];
  return (cfg && typeof cfg.discount === 'number') ? cfg.discount : 1;
}

// 获取课程在某城市的实际价格（已应用折扣），'待定' 原样返回
function getEffectivePrice(course, city) {
  if (typeof course.price !== 'number') return course.price;
  return Math.round(course.price * getCityDiscount(city));
}

// 生成价格显示HTML（含原价划线 + 折扣标签）
function renderPriceHTML(course, city) {
  if (typeof course.price !== 'number') {
    return `<span class="course-price-pending">${course.price}</span>`;
  }
  const discount = getCityDiscount(city);
  if (discount >= 1) {
    return `<span class="course-price">¥${course.price}<span class="unit">/人</span></span>`;
  }
  const final = Math.round(course.price * discount);
  return `<span class="course-price-wrap">
    <span class="course-price-origin">¥${course.price}</span>
    <span class="course-price">¥${final}<span class="unit">/人</span></span>
    <span class="price-discount-tag">${Math.round(discount * 10)}折</span>
  </span>`;
}

// 根据城市获取可用课程
function getCoursesForCity(city) {
  const config = CITIES[city];
  if (!config) return [];
  if (config.courses === 'all') return COURSES;
  return COURSES.filter((c) => config.courses.includes(c.id));
}

// 场地配置（排课时选择，用于场地冲突检测与容量预警）
// city 限定该场地所属城市；排期下拉框仅展示对应城市的场地
const VENUES = [
  { id: 'venue_hall', name: '华大时空中心 · 主展厅', capacity: 500, stagger: true, city: '深圳' },
  { id: 'venue_lab_a', name: '实验楼 A 区 · 实验室', capacity: 50, city: '深圳' },
  { id: 'venue_lab_b', name: '实验楼 B 区 · 实验室', capacity: 50, city: '深圳' },
  { id: 'venue_report', name: '学术报告厅', capacity: 120, city: '深圳' },
  { id: 'venue_multi', name: '多功能教室', capacity: 40, city: '深圳' },
  { id: 'venue_wuhan', name: '武汉华大智惠园', capacity: 500, stagger: true, city: '武汉' },
  { id: 'venue_hangzhou', name: '杭州华大生命科学研究院', capacity: 500, stagger: true, city: '杭州' },
];

function getVenueName(id) {
  const v = VENUES.find((x) => x.id === id);
  return v ? v.name : (id || '—');
}

// 按城市获取可用场地（排期下拉框使用）
function getVenuesForCity(city) {
  if (!city) return VENUES;
  const list = VENUES.filter((v) => v.city === city);
  return list.length ? list : VENUES;
}

// 各城市参访场地的展示名（课程文案按城市动态替换）
function getCityVenueLabel(city) {
  if (city === '武汉') return '武汉华大智惠园';
  if (city === '杭州') return '杭州华大生命科学研究院';
  return '华大时空中心';
}

// 将课程文案中的"华大时空中心"按当前城市替换为对应参访场地（深圳不替换）
function cityVenueText(text, city) {
  if (!text || city === '深圳' || city === '深圳') return text;
  return String(text).split('华大时空中心').join(getCityVenueLabel(city));
}

// 课程图片映射
// 优先用内联 base64（由 js/course-images.js 提供，规避部署工具不传二进制的问题），
// 若该脚本缺失则回退到原 images/ 路径。
const COURSE_IMAGES = {};
(function () {
  const b64 = (typeof window !== 'undefined' && window.COURSE_IMAGE_B64) || {};
  for (let i = 1; i <= 27; i++) {
    COURSE_IMAGES[i] = b64['course_' + i] || ('images/course_' + i + '.jpeg');
  }
})();

// 根据ID获取课程
function getCourseById(id) {
  return COURSES.find((c) => c.id === id);
}

// 根据ID获取课程图片
function getCourseImage(id) {
  return COURSE_IMAGES[id] || '';
}

// 获取分类信息
function getCategoryInfo(category) {
  return CATEGORIES[category] || { name: category, color: '#6B7280' };
}

// 获取某城市可用的大类列表（按 COURSE_SERIES 定义顺序）
function getSeriesForCity(city) {
  const courses = getCoursesForCity(city);
  const seen = new Set();
  const result = [];
  for (const c of courses) {
    const s = c.series;
    if (s && !seen.has(s)) {
      seen.add(s);
      result.push(s);
    }
  }
  return result;
}

// 获取大类信息
function getSeriesInfo(seriesKey) {
  return COURSE_SERIES[seriesKey] || { name: seriesKey, icon: '📘' };
}
