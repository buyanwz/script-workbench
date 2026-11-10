// ---------------------------------------------------------------------------
// 封面风格库（封面生成页）：风格 = 一套可执行的封面设计规则，不是一句
// 形容词。每套风格包含：主特点分析（给用户看，讲清这套风格长什么样、
// 为什么抓人）、中文 / 英文规则块（拼进生图提示词，约束模型照规则出
// 图）、负面口径（明确不要什么）。新增风格时在这里加一条即可：封面页
// 的风格下拉、剧本分析的推理口径、提示词拼装都会自动带上，不用改
// 页面与动作层（客户端与服务端共用这一份实现，口径不分叉）。
//
// 风格 1「爆款VS对抗」来自用户给的参考图（野生狗奶系列 12 张封面
// 拼图）逐张分析，主特点见 EXPLOSIVE_VS_TRAITS。
// v3.93 新增风格 2「怼脸梗贴纸」与风格 3「拼贴回忆」：来自用户
// 2026-10-30 认可的 11 张封面（提炼为 3 类版式，第 1 类即风格 1）。
// 两套新风格的构图 / 标题不是左右对峙，拼装走 CoverStyleDef 上的
// 专属钩子（composition / titleLine / shortExtra 等），风格 1 不设
// 钩子、产出逐字不变。
// ---------------------------------------------------------------------------

export interface CoverCharacterPosition {
  /** 上封面人物名，与 mainCharacters 里的名字一字不差。 */
  name: string;
  /** 只写位置方方面面：一句话位置描述（如「左侧」「画面中央前景」「下格左」
   * 「小帅身后」），不写外貌、服装、表情、动作——长相穿搭以参考图为准。 */
  position: string;
}

export interface CoverPlan {
  /** vs = 双阵营对撞版式；slogan = 单句钩子大标题版式（无明确对立面时用）。 */
  layoutType: "vs" | "slogan";
  /** 封面主标题全文（vs 时通常就是「A VS B」两边的合称，见 sideA/sideB）。 */
  mainTitle: string;
  /** vs 左阵营短名（2–6 字，进标题左半）。 */
  sideA: string;
  /** vs 右阵营短名（2–6 字，进标题右半）。 */
  sideB: string;
  /** 两层标题类风格（风格 9/10）的副标题文字（木牌 / 纸条上的那句，属
   * 标题本身的一部分）；其他风格为空。 */
  subtitle: string;
  /** 上封面的主要人物名（按重要性排序）。 */
  mainCharacters: string[];
  /** v5.09 人物站位：每位上封面人物一条，只给位置——分析只定「谁站在
   * 哪里」，人物的长相、穿搭一律以提交的参考图为准，不写进任何文字。 */
  characterPositions: CoverCharacterPosition[];
  /** v5.09 标题位置（标题放在画面哪里，一句话，如「画面顶部居中」）。 */
  titlePosition: string;
  /** v5.09 标题风格（字体、颜色、大小、描边、特效，一句话写清）。 */
  titleStyle: string;
  /** 英文稿用的站位重译（服务端第二步只译位置短句，名字保持中文原文；
   * null = 重译失败 / 未跑，英文稿回退中文位置）。 */
  characterPositionsEn?: CoverCharacterPosition[] | null;
  /** 英文稿用的标题位置重译（同上）。 */
  titlePositionEn?: string | null;
  /** 英文稿用的标题风格重译（同上）。 */
  titleStyleEn?: string | null;
}

export interface CoverStyleDef {
id: string;
label: string;
shortDesc: string;
/** 这套风格的来历与一句话提炼（封面页展示给用户看）。 */
analysisSummary: string;
/** 主特点清单：标题 / 说明成对，封面页「风格规则」区逐条展示。 */
traits: { title: string; body: string}[];
/** 拼进中文提示词的完整规则块。 */
rulesZh: string;
/** 拼进英文提示词的完整规则块（与中文一一对应）。 */
rulesEn: string;
negativeZh: string;
negativeEn: string;
/** v3.90 浓缩稿用的风格短名（提示词第一行用，不带「风格N ·」前缀）。 */
shortNameZh: string;
shortNameEn: string;
/** v3.90 浓缩稿用的风格精华句（一句，浓缩稿的风格段只用它，不再
 * 拼整段规则块）；从本风格规则里提炼，不引入新约束。 */
digestZh: string;
digestEn: string;
/** v3.90 本风格的既有固定配色方案（浓缩稿的配色段只用它，不临场
 * 编新配色）；取自本风格规则里的配色口径。 */
paletteZh: string;
paletteEn: string;
/** v3.90 浓缩稿用的短负面口径（完整版仍用 negativeZh/En）。 */
negativeShortZh: string;
negativeShortEn: string;
/** v3.93 风格专属拼装钩子（风格1 全部不设、走默认 VS/slogan 口径，
 * 逐字不变；风格2/3 的构图与标题不是左右对峙，必须换掉默认句，
 * 否则提示词会串味）。 */
/** 锁定版式：设了之后分析与页面都固定这个 layoutType。 */
forceLayout?: "slogan";
/** 分析口径补充：拼进分析提示词，与通用条冲突时以它为准。 */
analysisGuideZh?: string;
/** 与画幅无关的通用构图句（替代默认的 VS 对峙构图）。 */
compositionZh?: string;
compositionEn?: string;
/** 完整版提示词的标题行（替代默认标题行）。 */
titleLineZh?: (plan: CoverPlan) => string;
titleLineEn?: (plan: CoverPlan) => string;
/** 浓缩短稿的标题行（替代默认标题行）。 */
shortTitleLineZh?: (plan: CoverPlan, title: string) => string;
shortTitleLineEn?: (plan: CoverPlan, title: string) => string;
/** 浓缩短稿的风格专属补充行（贴纸 / 拼贴结构），可空。 */
shortExtraZh?: string;
shortExtraEn?: string;
/** 浓缩短稿里核心道具的呈现方式（替代「放大到画面中央前景」）。 */
propShortHintZh?: string;
propShortHintEn?: string;
/** 完整版里核心道具 / 特效行的标签（替代默认的 VS 口径标签）；
 * 封面页方案编辑区的字段名也复用这两个标签。 */
propLabelZh?: string;
propLabelEn?: string;
effectsLabelZh?: string;
effectsLabelEn?: string;
}

// ---------------------------------------------------------------------------
// 风格 1：爆款 VS 对抗（参考图逐张分析）
//
// 参考图是同一系列的 12 张竖版封面：11 张是「野生狗奶 VS ○○」的
// 对抗式，1 张是单句口号式（「我要“熟的”!」）、1 张是人物宣言式
// （「我真的是演员啊!」）。12 张共享同一套视觉语言，差异只在右
// 阵营的主题道具与特效。抓主特点时只抓 12 张里反复出现的共性，
// 一次性的个案元素（点赞数、社会榜角标等平台 UI）不算风格。
// ---------------------------------------------------------------------------

const EXPLOSIVE_VS_TRAITS: { title: string; body: string}[] = [
{
title: "巨型标题压顶，占满顶部约四分之一",
body: "主标题是整张封面的第一视觉：超大号粗体中文（综艺美术字），字高约占画幅高度的 15%–25%，横向撑满、紧贴顶部，带粗黑描边与硬阴影，微微倾斜带冲劲。缩略图状态下（信息流里几厘米宽）也要一眼读出标题——标题读不出，这张封面就不成立。次要小字一律退到气泡里，绝不和主标题抢字号。",
},
{
title: "VS 对撞结构：左黄右蓝，中间一枚爆炸 VS 徽章",
body: "有对立面时标题天然分两半：左阵营名用亮黄色、右阵营名用冰蓝 / 青蓝 / 紫等冷色，两边同为粗黑描边、相向倾斜；正中间嵌一枚红黄渐变的「VS」爆炸徽章（锯齿爆裂底形），既是标题的连接件，也是整张画面的视觉铰链，把左右两组人物在构图上真正「撞」在一起。没有明确对立面的剧本改走 slogan 版式：单句钩子大字压顶（如参考图「我真的是演员啊!」），规则其余不变。",
},
{
title: "真人抠图拼贴：大头、大表情、白边描边分层叠放",
body: "人物不是画出来的插画，是真人照片感抠图：2–4 位主要人物以半身 / 大头近景出现，脸占画面比例大，带白色描边从背景里「贴」出来，前后错落叠放。左右阵营分组站位、身体朝向对方，形成对峙。参考图里同一人物还会以小尺寸在角落重复出现造声势，本工作台的封面只用剧本里真实存在的人物，不复制人不凑数。",
},
{
title: "表情与动作全部夸张到综艺级",
body: "每张脸都是情绪峰值：瞪眼、张口大喊、狂笑、震惊、被冻得龇牙——没有平静表情、没有证件照式站姿。动作带指向性：手指镜头、举道具冲向对方、护住核心道具。封面卖的是冲突瞬间的那一秒，不是人物定妆照。",
},
{
title: "核心道具放大到画面中央，带一条动势线",
body: "右阵营的主题道具（垃圾桶、相机、魔术帽、枕头、宝物、冰块……）被放大到不合比例地大，放在画面中央或中下前景，发光、被特效包围；左阵营的标志物（参考图里是奶瓶倾倒）泼洒出一条白色奶浪 / 能量弧线，斜穿画面把两边连起来。本工作台里：核心道具取自本剧本最关键的那件道具或那场戏的标志物，动势线按道具性质换成水花、光弧、烟尘等同类液体 / 能量轨迹。",
},
{
title: "主题特效填满所有空隙，绝不留白",
body: "背景与人物之间的每一块空隙都被与右阵营主题呼应的特效填满：火焰配漩涡主题、冰晶雪花配冰、紫色电光配超能力与魔术、蓝色查克拉漩涡配忍者、星尘配宝物与美梦。特效同时承担「说明右阵营是什么」的信息功能——观众不读字，光看特效就知道对手的主题。画面信息密度拉满，没有一寸安静的留白。",
},
{
title: "高饱和互补色：暖黄 + 红 对撞 冷蓝",
body: "主配色是补色对撞：标题左半与爆炸贴的亮黄、VS 与火焰的红橙，撞上背景与标题右半的天蓝 / 电蓝 / 冰蓝，白色的液体飞溅做中间过渡。饱和度与对比度全部拉高，不用低饱和、莫兰迪、性冷淡色。黑色只用在描边与阴影上托字，不做大面积底色（个别夜景题材封面才用深底，但标题配色不变）。",
},
{
title: "小字气泡与贴纸只做第二层",
body: "人物旁配 2–4 个白色对话气泡（人物口吻的短台词，如「我这可是野生狗奶!」）与黄色锯齿爆炸贴（钩子句 / 疑问句，如「究竟谁更强?!」），再点缀皇冠、星星、狗爪印、问号叹号等小贴纸。这些只做气氛与信息补充，字号远小于主标题，不抢第一视觉；没有合适的台词宁可少放，不编与剧情无关的话。",
},
];

// v3.85 压缩口径：Geeknow 提交端点对 prompt 有 4000 字符硬上限
// （超了直接 400 invalid_request）。旧版英文规则全文 2542 字符，
// 光固定块（规则 + 负面 + 比例构图）就约 3050，方案细节稍长就必
// 超。本版规则中英文都压成紧凑版：硬约束一条不少（标题逐字、VS
// 徽章与左右配色、抠图拼贴、夸张表情、核心道具与动势线、特效填
// 满、高饱和对撞、气泡第二层、负面口径），删的只是解释性重复。
// 页面上给用户看的「主特点」用的是 traits，不受这里压缩影响。
// 拼装层另有硬性字数预算兜底（见 SUBMIT_PROMPT_BUDGET）。
const EXPLOSIVE_VS_RULES_ZH = [
"严格按以下规则设计，不要自由发挥成其他风格：",
"1. 满版构图、信息密度拉满：画面边到边全部铺满，没有留白；背景是与剧情呼应的场景，铺满全画幅。",
"2. 巨型主标题压住顶部：超大号中文综艺美术粗体，粗黑描边加硬阴影，字高约占画幅高度五分之一，横向撑满，缩略图下也要一眼可读；标题文字逐字准确，不得改字、漏字、多字、错字。",
"3. VS 版式标题分两半：左阵营名亮黄色、右阵营名冰蓝或青蓝色，相向微微倾斜，中间嵌一枚红黄渐变、锯齿爆裂底形的立体「VS」徽章（在标题与画面中央）；slogan 版式单句标题通顶，关键词用红色或冰蓝色突出，其余规则不变。",
"4. 人物用真人照片感抠图拼贴：主要人物半身近景、大脸、白描边贴纸感，前后叠放；左右阵营分组对峙、身体与视线指向对方；每张脸都是夸张的情绪峰值表情（瞪眼、大喊、狂笑、震惊），动作带指向性（指镜头、举道具、护道具），绝不平静站姿、绝不定妆照。",
"5. 核心道具放大到画面中央前景，尺寸不合比例地大、带发光与特效包围；一条液体飞溅或能量弧线的动势线斜穿画面，连接左右两边。",
"6. 主题特效填满人物与背景之间的所有空隙，与右阵营（或标题主题）严格呼应，让人不读字也能看出对手主题。",
"7. 配色高饱和补色对撞：亮黄与红橙 对 天蓝、电蓝、冰蓝，白色飞溅过渡，黑色只作描边与阴影；禁止低饱和、灰调、莫兰迪色。",
"8. 第二层小元素：2–4 个白色对话气泡放人物短台词，1 个黄色锯齿爆炸贴放钩子句，点缀少量皇冠、星星、问号叹号贴纸；小字远小于主标题，不得喧宾夺主，文字同样逐字准确。",
"9. 整体气质：短视频平台爆款综艺封面，热闹、夸张、冲突感强，0.5 秒内让观众看懂「谁和谁、为了什么、打起来了」。",
].join("\n");

const EXPLOSIVE_VS_RULES_EN = [
"[Cover style: Explosive VS Showdown] Follow strictly; do not drift into another style:",
"1. Full-bleed maximalist composition: every inch filled, no negative space, no quiet corners; background is the story's scene, edge to edge.",
"2. Giant main title across the top: extra-bold Chinese variety-show lettering, thick black outline, hard shadow, letter height ~1/5 of frame, full width, readable at thumbnail size; title text character-for-character exact — no altered, missing, extra or wrong characters.",
"3. VS layout: left camp name bright yellow, right camp ice blue/cyan, tilted toward each other; red-to-yellow gradient 3D 'VS' badge on a jagged explosion shape at title center and frame center. Slogan layout: one hook sentence across the top, keyword in red or ice blue; other rules unchanged.",
"4. Characters as live-action photo cutouts: half-body close-ups, big faces, white sticker outline, layered; camps left vs right, bodies and gazes aimed at the other camp; peak exaggerated expressions (wide eyes, shouting, laughing, shocked), pointing poses (point at camera, raise the prop, guard the prop); never calm expressions, never ID-photo poses.",
"5. Key prop oversized at center foreground, glowing, wrapped in effects; one splash or energy arc slashes diagonally across the frame, linking both camps.",
"6. Themed effects fill every gap, strictly matching the right camp's theme — the theme must read without the words.",
"7. High-saturation complementary clash: bright yellow + red-orange vs sky/electric/ice blue, white splashes between, black only for outlines and shadows; no desaturated, gray or Morandi tones.",
"8. Second layer only: 2-4 white speech bubbles with short character lines, one yellow jagged sticker with the hook line, a few crown/star/?/! stickers; small text far smaller than the title, also character-exact.",
"9. Viral short-video variety cover: loud, exaggerated, conflict-forward; 'who vs who, over what' readable in half a second.",
].join("\n");

// ---------------------------------------------------------------------------
// 风格 2：怼脸梗贴纸（用户 2026-10-30 给的 11 张认可封面里第 2 类：
// 《送给朋友的祝福》《上课时唱网络热梗》《爱慕杰的爸爸叫爱建国》
// 《方便面哲学》——单集梗 / 人物向封面共用这一版式）
// ---------------------------------------------------------------------------

const FACE_MEME_TRAITS: { title: string; body: string}[] = [
{
title: "怼脸特写：夸张表情占满画面一半以上",
body: "单人或双人的面部特写怼满画面主体，人物占画面约二分之一以上，脸是第一视觉焦点。表情必须是情绪峰值——哭、喊、笑、震惊做到极致（瞪眼、张口、龇牙），再配一个指向性动作（指镜头、举道具、捂脸）。没有平静脸、没有定妆照。",
},
{
title: "标题规范：黄底黑边 + 彩色投影 + 3D 倾斜 + 爆炸底衬",
body: "主标题超大字号，占据顶部约三分之一：黄字（或黄底）黑描边、带彩色投影、3D 倾斜，背后垫一层爆炸形底衬，缩略图下也要一眼读出。文案是口语梗化的短标题，不端着、不写书面语。",
},
{
title: "梗贴纸环绕人物：3–6 个，与标题梗点呼应",
body: "人物四周贴 3–6 个梗元素贴纸：红 X 标记、对话气泡框、音符、星星、闪电、表情包式小人。贴纸不是随便撒的装饰——每一个都和标题的梗点呼应（唱歌梗配音符、说错话配红 X），帮观众 0.5 秒看懂笑点在哪。",
},
{
title: "高饱和波普漫画风：黄红蓝 + 粗描边",
body: "色彩是高饱和的黄、红、蓝对撞，人物与贴纸都带粗描边，波普漫画感。背景是剧情里的真实场景、退后虚化，只交代环境，不和脸抢焦点；禁止低饱和、灰调、莫兰迪。",
},
{
title: "适用：单集梗、人物向封面",
body: "这一版式不讲对抗、讲一个人一个梗：一张脸 + 一句梗标题 + 一圈呼应贴纸。适合单集爆点、人物名场面、口语梗标题的封面；有明确对立两方时用风格1，回忆合集用风格3。",
},
];

const FACE_MEME_RULES_ZH = [
"严格按以下规则设计，不要自由发挥成其他风格：",
"1. 怼脸构图：一位或两位主角的面部特写占据画面中下部主体，人物占画面二分之一以上，脸是第一视觉焦点；背景是与剧情呼应的真实场景、虚化退后，不抢焦点。",
"2. 巨型主标题占顶部约三分之一：超大号中文综艺美术粗体，黄字黑描边加彩色投影、3D 倾斜，背后垫爆炸形底衬，横向撑满，缩略图下也要一眼可读；标题文字逐字准确，不得改字、漏字、多字、错字。",
"3. 表情夸张到情绪峰值：哭、喊、笑、震惊做到极致（瞪眼、张口大喊、龇牙、捂脸），配一个指向性动作（指镜头、举道具、护住道具）；绝不平静表情、绝不定妆照式站姿。",
"4. 人物用真人照片感呈现（外貌与服装以随附的人物资产图为准，同一个人同一张脸同一套衣服），带粗描边贴纸感，与漫画风背景统一。",
"5. 人物四周贴 3–6 个梗元素贴纸：红 X 标记、对话气泡框、音符、星星、闪电、表情包式小人，贴纸内容与标题的梗点严格呼应；贴纸只做第二层，不盖住脸、不抢主标题。",
"6. 配色高饱和波普漫画风：黄、红、蓝为主色，粗黑描边；禁止低饱和、灰调、莫兰迪色。",
"7. 气泡小字最多 2 句，放在对应人物旁，字号远小于主标题，文字逐字准确。",
"8. 整体气质：短视频爆款梗封面，一张脸一个梗，0.5 秒内让观众看懂「谁、什么表情、笑点在哪」。",
].join("\n");

const FACE_MEME_RULES_EN = [
"[Cover style: Face Meme Stickers] Follow strictly; do not drift into another style:",
"1. In-your-face composition: one or two leads in extreme facial close-up filling the middle-lower frame, characters taking at least half the frame, the face is the first focal point; background is the story's real scene, blurred back, never competing with the face.",
"2. Giant main title across the top third: extra-bold Chinese variety-show lettering, yellow letters with thick black outline and colored drop shadow, 3D tilt, explosion-shaped backing, full width, readable at thumbnail size; title text character-for-character exact — no altered, missing, extra or wrong characters.",
"3. Peak exaggerated expression: crying, shouting, laughing or shocked pushed to the extreme (wide eyes, open mouth, gritted teeth, hands on face), plus one pointing gesture (point at camera, raise the prop, guard the prop); never calm expressions, never ID-photo poses.",
"4. Characters in live-action photo look (faces and outfits must match the attached character asset images — same person, same face, same outfit), thick sticker outline, unified with the comic-style background.",
"5. 3-6 meme stickers around the characters: red X marks, speech-bubble frames, music notes, stars, lightning bolts, meme figures — sticker content strictly echoing the title's gag; stickers are second layer only, never covering the face, never outshouting the title.",
"6. High-saturation pop-comic colors: yellow, red and blue leads, thick black outlines; no desaturated, gray or Morandi tones.",
"7. At most 2 speech bubbles with short lines next to the speaker, far smaller than the title, also character-exact.",
"8. Viral meme cover: one face, one gag — 'who, what expression, where is the joke' readable in half a second.",
].join("\n");

// ---------------------------------------------------------------------------
// 风格 3：拼贴回忆（11 张认可封面里第 3 类：《小时候我以为的那些事》
// 《小时候以为的事》《小时候开智前做过的事》——「小时候」回忆
// 系列 / 合集类封面共用这一版式）
// ---------------------------------------------------------------------------

const COLLAGE_MEMORY_TRAITS: { title: string; body: string}[] = [
{
title: "拼贴构图：3–5 个小场景，撕纸边缘分隔、错落排布",
body: "画面由 3–5 个小场景拼贴而成，用纸张撕裂或锯齿边缘把格与格分开，大小不一、错落排布，不排成整齐网格。每一格都是一个独立的小画面，合起来是一段回忆的合集感。",
},
{
title: "标题规范与怼脸款相同：占顶部约三分之一",
body: "主标题超大字号、黄底黑边加彩色投影、3D 倾斜、背后垫爆炸形底衬，占据顶部约三分之一，拼贴格子全部退到标题下方。标题是回忆系列的合称（如「小时候我以为的那些事」式），口语、不端着。",
},
{
title: "每格一个梗点或回忆点，配小字标注",
body: "每一格只讲一件事：一个梗点或一个回忆点，格内人物表情夸张、动作明确；格旁配小字标注点题（如「爆笑回忆」「童年迷惑行为」），小字远小于主标题，只做点题、不抢戏。",
},
{
title: "暖色怀旧基调 + 高饱和点缀",
body: "底色是暖色怀旧调（暖黄、旧纸色、土色），像翻开一本旧相册；标题、贴纸与重点元素用高饱和红蓝黄点缀提神，粗描边保持系列漫画感。禁止冷灰调与低饱和。",
},
{
title: "适用：「小时候」回忆系列、合集类封面",
body: "这一版式讲的是一组回忆而不是一个瞬间：多格拼贴天然带合集感。适合回忆系列、童年迷惑行为合集、多段并列的集锦封面；单集单梗用风格2，有明确对立两方用风格1。",
},
];

const COLLAGE_MEMORY_RULES_ZH = [
"严格按以下规则设计，不要自由发挥成其他风格：",
"1. 拼贴构图：标题下方排 3–5 个小场景，用纸张撕裂或锯齿边缘分隔，大小不一、错落排布，不排成整齐网格；每一格是一个独立的小场景画面。",
"2. 巨型主标题占顶部约三分之一：超大号中文综艺美术粗体，黄字黑描边加彩色投影、3D 倾斜，背后垫爆炸形底衬，横向撑满，缩略图下也要一眼可读；标题文字逐字准确，不得改字、漏字、多字、错字。",
"3. 每格一个梗点或回忆点：格内人物表情夸张到情绪峰值、动作明确（不平静站姿、不定妆照），格旁配一句小字标注点题（如「爆笑回忆」「童年迷惑行为」），小字逐字准确、字号远小于主标题。",
"4. 人物用真人照片感呈现（外貌与服装以随附的人物资产图为准，同一人物同脸同衣），各格之间人物一致。",
"5. 配色：暖色怀旧基调（暖黄、旧纸色、土色）打底，标题、贴纸与重点元素用高饱和红、蓝、黄点缀，粗描边；禁止冷灰调、低饱和、莫兰迪色。",
"6. 格间空隙点缀少量小贴纸（星星、问号、箭头、太阳），只做气氛，不抢标题、不盖住任何一格的画面。",
"7. 整体气质：童年回忆合集封面，热闹、怀旧、多格并列，一眼看懂「小时候那些事」。",
].join("\n");

const COLLAGE_MEMORY_RULES_EN = [
"[Cover style: Collage Memories] Follow strictly; do not drift into another style:",
"1. Collage composition: 3-5 small scenes below the title, separated by torn-paper or jagged edges, varied sizes, staggered layout — never a neat grid; each cell is one self-contained little scene.",
"2. Giant main title across the top third: extra-bold Chinese variety-show lettering, yellow letters with thick black outline and colored drop shadow, 3D tilt, explosion-shaped backing, full width, readable at thumbnail size; title text character-for-character exact — no altered, missing, extra or wrong characters.",
"3. One gag or memory point per cell: characters at peak exaggerated expression with a clear action (never calm, never ID-photo poses), plus one small caption next to the cell naming its point (e.g. 爆笑回忆 / 童年迷惑行为 — exact Chinese characters), far smaller than the title.",
"4. Characters in live-action photo look (faces and outfits must match the attached character asset images — same person, same face, same outfit in every cell).",
"5. Colors: warm nostalgic base (warm yellow, old-paper tones, earth tones) with high-saturation red/blue/yellow accents on the title, stickers and focal elements, thick outlines; no cold grays, no desaturated or Morandi tones.",
"6. A few small stickers (stars, question marks, arrows, suns) in the gaps between cells — atmosphere only, never covering the title or any cell.",
"7. Childhood-memory compilation cover: lively, nostalgic, multi-cell — 'those childhood things' readable at a glance.",
].join("\n");

// ---------------------------------------------------------------------------
// v5.00 新增风格 4–8：学自 1000+ 赞封面的版式——用户采集的封面里
// 点赞 1000 以上的 21 张亲眼分析分类（全景场景+人物 6 张 / 群像拼
// 贴 5 张 / 竖版海报式大标题 4 张 / 单人+大标题 3 张 / 双人·多方
// 对峙 VS 2 张；余下 1 张单人怼脸无字版未采纳、本版不加）。风格
// 4 / 5 是全新版式，风格 6 是风格 2 的细化，风格 7 是风格 3 的推
// 广，风格 8 是风格 1 的变体扩展。五款的中英文提示词模板按用户定
// 稿原文收录，【】是待分析方案填充的占位符、不编造具体画面内容；
// 拼装走与风格 2 / 3 相同的专属钩子口径（构图 / 标题行 / 标签）。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 风格 4：全景故事感（分类 2，全新；单集梗、有明确场景 + 2 人以上
// 群像）
// ---------------------------------------------------------------------------

const PANORAMA_STORY_TRAITS: { title: string; body: string }[] = [
  {
    title: "全景构图：一整个场景里的一群人，正在干一件荒诞事",
    body: "封面就是剧里最有戏的一幕全景：一个明确场景（教室 / 食堂 / 医院 / 户外）铺满画面，2 人以上人物在场景里同框，人物和场景一起讲故事，不是把人抠出来贴在背景上。",
  },
  {
    title: "大标题压顶或压底，占画面上部约三分之一",
    body: "大标题压在顶部或底部，占画面上部约三分之一，缩略图下也要一眼读出；先读标题、再看全景里这群人在干什么。",
  },
  {
    title: "标题配色：关键词着色、其余白色、黑色粗描边",
    body: "标题关键词用醒目颜色，其余字白色，全字黑色粗描边；画面走超写实真人实拍、电影质感、自然光，不堆贴纸特效。",
  },
  {
    title: "适用条件",
    body: "单集梗、有明确场景（教室/食堂/医院/户外）+ 2 人以上群像；不适合单人独白、回忆拼贴。",
  },
];

const PANORAMA_STORY_RULES_ZH =
  "竖版 9:16，超写实真人实拍，电影质感，自然光；全景【场景】，【人物群像】，【正在做的荒诞事】；顶部（或底部）大标题「【主标题】」，【关键词】用【颜色】，其余白色，黑色粗描边；标题占画面上部约三分之一；无水印，无平台 UI。";

const PANORAMA_STORY_RULES_EN =
  "Vertical 9:16, hyper-realistic live-action, cinematic, natural light; wide shot of【Scene】,【Group of characters】,【The absurd thing they are doing】; large title text at the top (or bottom): \"【Main title】\", keyword【Keyword】 in【Color】, rest in white, thick black outline; title occupies about one third of the frame; no watermark, no platform UI.";

// ---------------------------------------------------------------------------
// 风格 5：单人半身大标题（分类 3，全新；单主角单集梗）
// ---------------------------------------------------------------------------

const SOLO_HALF_TITLE_TRAITS: { title: string; body: string }[] = [
  {
    title: "单人半身：主角居中偏下，表情动作就是笑点",
    body: "一位主角半身出镜、居中偏下，表情夸张、动作明确——主角的表情和动作本身就是这一集的梗；背景虚化退后，只交代环境，不和人抢焦点。",
  },
  {
    title: "大标题压顶，占上部约三分之一到四成",
    body: "顶部一句大标题，关键词用特大字、其余白色、黑色粗描边，占画面上部约三分之一到四成，干净利落、一眼读完。",
  },
  {
    title: "适用条件",
    body: "单主角单集梗；主角表情/动作本身就是笑点；不适合多人对峙、多线叙事。",
  },
];

const SOLO_HALF_TITLE_RULES_ZH =
  "竖版 9:16，超写实真人实拍；半身【人物】，居中偏下，【夸张表情/动作】；顶部大标题「【主标题】」，【关键词】用特大字，其余白色，黑色粗描边；标题占画面上部约三分之一到四成；背景虚化；无水印，无平台 UI。";

const SOLO_HALF_TITLE_RULES_EN =
  "Vertical 9:16, hyper-realistic live-action;【Character】, half-body, lower center,【Exaggerated expression / action】; large title text at the top: \"【Main title】\", keyword【Keyword】 in extra large, rest in white, thick black outline; title occupies about one third to two fifths of the frame; background blurred; no watermark, no platform UI.";

// ---------------------------------------------------------------------------
// 风格 6：海报式贴纸轰炸（分类 1，对风格 2 的细化；梗密、标志性道
// 具 / 多方反应）
// ---------------------------------------------------------------------------

const POSTER_STICKER_BOMB_TRAITS: { title: string; body: string }[] = [
  {
    title: "顶部超大标题打头，标题本身就是梗",
    body: "超大标题占据顶部打头，关键词着色、其余白色、黑色粗描边；这款的标题不只是说明，标题本身就是笑点的一部分。",
  },
  {
    title: "中部堆满：人物、道具、多方反应全上",
    body: "画面中部把人物、标志性道具和多方反应都堆上去，信息密度拉满，热闹得像一张手绘海报。",
  },
  {
    title: "漫画贴纸轰炸：气泡、贴纸、放射线叠加",
    body: "在实拍画面上叠加漫画贴纸元素：对话气泡、梗贴纸、放射线，贴纸与标题的梗点呼应，主色调鲜明。是风格2「怼脸梗贴纸」的细化款：梗更密、东西更多时用这款。",
  },
  {
    title: "适用条件",
    body: "单集梗里有标志性道具或多方反应；标题本身就是梗；不适合严肃/悬念/温情题材。",
  },
];

const POSTER_STICKER_BOMB_RULES_ZH =
  "竖版 9:16，超写实真人实拍；顶部超大标题「【主标题】」，【关键词】用【颜色】，其余白色，黑色粗描边，【标题装饰】；中部【人物/道具/多方反应画面】；叠加漫画贴纸元素：对话气泡「【气泡台词】」、【贴纸元素】、放射线；主色调【主色】+【辅色】；无水印，无平台 UI。";

const POSTER_STICKER_BOMB_RULES_EN =
  "Vertical 9:16, hyper-realistic live-action; extra-large title text at the top: \"【Main title】\", keyword【Keyword】 in【Color】, rest in white, thick black outline,【Title decoration】; center:【Characters / props / reactions scene】; overlaid comic sticker elements: speech bubble \"【Bubble line】\",【Sticker elements】, radiating lines; dominant colors【Main color】 and【Accent color】; no watermark, no platform UI.";

// ---------------------------------------------------------------------------
// 风格 7：多格故事拼贴（分类 4，对风格 3 的推广；单集 2–3 个名场
// 面 / 时间线 / 地点，非回忆限定）
// ---------------------------------------------------------------------------

const MULTI_PANEL_STORY_TRAITS: { title: string; body: string }[] = [
  {
    title: "一大加两小：一张主画面 + 两张小画面，白边分格",
    body: "上部一大组群像主画面，下部并排两张小画面，各格之间用白色边框分隔；等于把全集高光提前剧透一遍。是风格3「拼贴回忆」的推广款：不限回忆题材，所有多线叙事都能用。",
  },
  {
    title: "顶部大标题，关键词着色、其余白色、黑粗描边",
    body: "大标题压在顶部，关键词用醒目颜色、其余白色、黑色粗描边；小画面内可配气泡小字点题，小字不抢主标题。",
  },
  {
    title: "适用条件",
    body: "单集有 2-3 个可并列的名场面/时间线/地点；不适合单场景单线叙事。",
  },
];

const MULTI_PANEL_STORY_RULES_ZH =
  "竖版 9:16，超写实真人实拍；上部一大组群像主画面，下部并排两张小画面，各格之间白色边框分隔；顶部大标题「【主标题】」，【关键词】用【颜色】，其余白色，黑色粗描边；小画面内可配气泡小字「【气泡小字】」；无水印，无平台 UI。";

const MULTI_PANEL_STORY_RULES_EN =
  "Vertical 9:16, hyper-realistic live-action; top: one large group main image, bottom: two small images side by side, white borders between panels; large title text at the top: \"【Main title】\", keyword【Keyword】 in【Color】, rest in white, thick black outline; small images may carry speech-bubble text \"【Bubble text】\"; no watermark, no platform UI.";

// ---------------------------------------------------------------------------
// 风格 8：多方阵营 VS（分类 5，风格 1 的变体扩展；两方 / 多方对
// 抗，每方有标志性人物或道具）
// ---------------------------------------------------------------------------

const CAMPS_VS_TRAITS: { title: string; body: string }[] = [
  {
    title: "两方阵营对峙：每方带一帮人或标志性道具",
    body: "风格1「爆款VS对抗」是两个人对峙，这款是阵营对峙：左方一帮人、右方一帮人，甚至带上各自的标志性道具，中央一个大\"VS\"（黑色粗描边、黄色星形爆炸底）。",
  },
  {
    title: "大标题在底部或顶部，关键词着色、黑粗描边",
    body: "对峙结构之外另有一句大标题，压在底部（或顶部）：关键词着色、其余白色、黑色粗描边。",
  },
  {
    title: "适用条件",
    body: "单集核心是两方/多方对抗，且每方有标志性人物或道具；不适合单人梗、温情题材。",
  },
];

const CAMPS_VS_RULES_ZH =
  "竖版 9:16，超写实真人实拍；左方【左方阵营（人物/道具）】，右方【右方阵营（人物/道具）】，中央大\"VS\"，【VS颜色】，黑色粗描边，黄色星形爆炸底；底部（或顶部）大标题「【主标题】」，【关键词】用【颜色】，其余白色，黑色粗描边；无水印，无平台 UI。";

const CAMPS_VS_RULES_EN =
  "Vertical 9:16, hyper-realistic live-action; left side:【Left camp (characters / props)】, right side:【Right camp (characters / props)】, large \"VS\" in the center,【VS color】, thick black outline, yellow starburst background; large title text at the bottom (or top): \"【Main title】\", keyword【Keyword】 in【Color】, rest in white, thick black outline; no watermark, no platform UI.";

// ---------------------------------------------------------------------------
// v5.02 新增风格 9–10：学自用户新发的两张封面亲眼分析提炼——风格 9
// 来自《离谱数学题 / 冻住全校？》（雪地奇观封面）、风格 10 来自
// 《走读生在 / 给我次机会》（海鲜摊封面）。两款共同的新结构是
// 「两层标题」：顶部两行超大标题 + 下方一块实体副标题载体（木牌 /
// 撕纸条），前景都有背对镜头的人物框住画面。现有 8 款逐字未动。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 风格 9：奇观特效大标题（超现实荒诞设定单集；标题带主题材质特
// 效 + 木牌副标题 + 中央荒诞奇观 + 前景背影）
// ---------------------------------------------------------------------------

const SPECTACLE_EFFECT_TITLE_TRAITS: { title: string; body: string }[] = [
  {
    title: "标题带主题材质特效：字本身就是奇观的一部分",
    body: "顶部两行超大标题，字体带主题材质特效（冰霜结晶、积雪、冰柱，或火焰、水花等与本集奇观呼应的材质），装饰元素（数学符号、雪花等）环绕标题；标题双色对撞，先读标题就知道本集的奇观是什么材质。",
  },
  {
    title: "木牌副标题：标题下面挂一块实体牌子写一句钩子",
    body: "标题下方挂一块木牌或招牌，上写一句副标题（本集的钩子句）；副标题是画面里的一块实体牌子，不是后期贴的字，和场景融为一体。",
  },
  {
    title: "中央荒诞奇观 + 前景背影框住画面",
    body: "画面中央放一个让人一眼愣住的荒诞奇观元素居中；前景用人物背影背对镜头框住画面，观众跟着背影一起看奇观；背景是场景全景，超写实真人实拍、电影质感、自然光。",
  },
  {
    title: "适用条件",
    body: "单集核心是一个荒诞奇观/超现实设定，且有明确的主题材质（冰雪/火焰/水等）可附在标题字上；不适合日常对话、温情、悬念题材。",
  },
];

const SPECTACLE_EFFECT_TITLE_RULES_ZH =
  "竖版 9:16，超写实真人实拍，电影质感，自然光；顶部两行超大标题「【标题第一行】」「【标题第二行】」，【标题颜色1】+【标题颜色2】，字体带【主题材质特效描述，如冰霜结晶、积雪、冰柱】，【数学符号/雪花等装饰元素描述】环绕；标题下方挂一块【木牌/招牌描述】，上写副标题「【副标题文字】」；中部【荒诞奇观元素描述】居中；前景【背影人物描述】背对镜头；【场景描述】全景；无水印，无平台 UI。";

const SPECTACLE_EFFECT_TITLE_RULES_EN =
  "Vertical 9:16, hyper-realistic live-action, cinematic, natural light; extra-large two-line title at the top: \"【title line 1】\" \"【title line 2】\", in 【color 1】 and 【color 2】, letters with 【thematic material effect, e.g. frost crystals, snow, icicles】, surrounded by 【decorative elements】; below the title a 【wooden sign / board description】 carrying the subtitle \"【subtitle text】\"; center: 【absurd spectacle element description】; foreground: 【characters seen from behind description】; wide shot of 【scene description】; no watermark, no platform UI.";

// ---------------------------------------------------------------------------
// 风格 10：烟火气纸条金句（市井摊位 / 小店单集；涂鸦大标题 + 撕
// 纸条金句 + 前景招牌商品特写）
// ---------------------------------------------------------------------------

const MARKET_NOTE_QUOTE_TRAITS: { title: string; body: string }[] = [
  {
    title: "涂鸦大标题：两行大字加几笔小涂鸦",
    body: "顶部两行超大标题，双色对撞，标题旁画几笔小涂鸦（纸飞机、爱心、星星等手绘感装饰），标题不端着、带市井烟火气的活泼感。",
  },
  {
    title: "撕纸条金句：标题下面贴一张纸条写一句金句",
    body: "标题下方贴一张撕纸条，上写一句副标题金句，关键词用红色下划线标出；纸条是画面里的一张实物纸，和摊位环境融为一体。",
  },
  {
    title: "前景招牌商品特写当视觉锚 + 一侧背影",
    body: "画面中部是摊位或小店场景，前景摆一盘招牌商品或食物特写当视觉锚；一侧有人物背影背对镜头，背景是招牌或菜单，超写实真人实拍、电影质感、自然光。",
  },
  {
    title: "适用条件",
    body: "单集场景在市井摊位/小店/校门口，有招牌商品或食物可拍特写；不适合荒诞奇观、严肃悬念题材。",
  },
];

const MARKET_NOTE_QUOTE_RULES_ZH =
  "竖版 9:16，超写实真人实拍，电影质感，自然光；顶部两行超大标题「【标题第一行】」「【标题第二行】」，【标题颜色1】+【标题颜色2】，配【涂鸦装饰描述，如纸飞机、爱心、星星】；标题下方贴一张撕纸条，上写副标题「【副标题文字】」，【关键词】用红色下划线标出；中部【摊位/小店场景描述】，前景【招牌商品特写描述】；一侧【背影人物描述】背对镜头；背景【招牌/菜单描述】；无水印，无平台 UI。";

const MARKET_NOTE_QUOTE_RULES_EN =
  "Vertical 9:16, hyper-realistic live-action, cinematic, natural light; extra-large two-line title at the top: \"【title line 1】\" \"【title line 2】\", in 【color 1】 and 【color 2】, decorated with 【doodle descriptions, e.g. paper plane, heart, sparkles】; below the title a torn paper note carrying the subtitle \"【subtitle text】\", keyword underlined in red; center: 【street stall / shop scene description】, foreground close-up of 【signature product description】; on one side 【character seen from behind description】; background 【sign / menu description】; no watermark, no platform UI.";

// ---------------------------------------------------------------------------
// 风格 11：证物揭晓（v5.15，用户 2026-11-06 拍板落地）。不学外部爆款
// 封面：从用户自己的三单精修解剖机制提炼（萝卜头=灵参、爸爸=校长、
// 规则字面执行）——中央证物特写 + 表面/真相双标签 + 揭晓式大标题 +
// 人物两侧当证人 + 档案红章封条。参照图暂无：等用户生成第一张风格
// 11 封面后替换，绝不用其他风格的图冒充（STYLE_REFERENCES 不加本款）。
// ---------------------------------------------------------------------------

const EVIDENCE_REVEAL_TRAITS: { title: string; body: string }[] = [
  {
    title: "证物居中放大：超写实特写占中央四到五成",
    body: "本集最关键的一样道具（或一个人）超写实特写，占画面中央四到五成，聚光灯打亮，带白色描边或证物框。证物就是笑点本身，观众先看证物再看标题就懂一半。",
  },
  {
    title: "表面和真相双标签：真相必须压过表面",
    body: "证物上方贴一张表面身份标签（小字、白底灰字：它看起来是什么），下方贴一张真实身份标签（大字、红底或金底：它实际是什么），两张标签之间一条红色撕裂线。真相标签的字号、颜色、底色必须压过表面标签。",
  },
  {
    title: "揭晓式大标题压顶：表面名 = 真实名",
    body: "顶部一句大标题，格式固定为表面名 = 真实名。真实名比表面名大一号，金黄渐变配红描边；表面名白字黑边，字号小于真实名。标题占顶部四分之一到三分之一。",
  },
  {
    title: "人物退居两侧当证人",
    body: "1 到 2 位主角分列证物左右两侧、半身、缩小到画面四分之一以下，表情是发现真相的震惊或被打脸的傻眼，手指证物。人物绝不抢证物中心位，脸不怼满画面。",
  },
  {
    title: "档案证物风第二层：红章、编号、封条",
    body: "深灰或牛皮纸档案底色（或暗色场景虚化）；证物角上贴一张红色证物编号签（证物 001）；画面边缘压一条黄色封条；标题旁盖一枚红色真相印章；小字气泡最多一句，放在发现者旁边。",
  },
  {
    title: "配色：暗底 + 金黄真相 + 红章 + 白表面标签",
    body: "暗底加金黄真相字加红色印章封条加白色表面标签。高对比但克制，拒绝十个风格那种全屏高饱和对撞。冷静的底色加一处滚烫的真相，是这个风格的识别点。",
  },
  {
    title: "适用条件",
    body: "单集核心是一个反转揭晓——某样东西或某个人表面一个身份、实际另一个身份；或核心是一次价格/价值错位（300 vs 300亿）。不适合纯对话梗、无反转的日常梗、回忆合集。",
  },
];

const EVIDENCE_REVEAL_RULES_ZH = [
  "【封面风格】证物揭晓（风格11），竖版，一份证物档案。",
  "【标题】表面名 = 真实名",
  "标题位置：顶部居中，横跨全宽，压在证物上方。",
  "标题风格：标题占画面宽度九成以上，整体微倾斜。主标题超大加粗白字、黑色粗描边；「=」做成红色爆炸形徽章，斜贴在标题正中，白色描边、黄色星芒点缀；真实名比表面名大一号，金黄渐变大字配红色描边，像真相标签一样醒目；表面名白字黑边，字号小于真实名。",
  "【证物】画面中央一样关键道具超写实特写，占画面中央四到五成，聚光灯打亮，带白色描边或证物框；证物就是笑点本身。",
  "【表面/真相双标签】证物上方贴一张表面身份标签（小字、白底灰字：它看起来是什么），下方贴一张真实身份标签（大字、红底或金底：它实际是什么），两张标签之间一条红色撕裂线；真相标签的字号、颜色、底色必须压过表面标签。",
  "【人物站位】本封面必须使用随附的人物资产图，人物必须同时出现在画面上，分列证物两侧，缺一不可；面部特征与整体造型严格以人物资产图为准、绝不更改，绝不凭空画人、绝不换脸；穿搭默认以资产图为准，场景需要时可以调整。",
  "1-2 位主角分列证物左右两侧、半身、缩小到画面四分之一以下，表情是发现真相的震惊或被打脸的傻眼，手指证物；人物绝不抢证物中心位，脸不怼满画面。",
  "【档案元素】深灰或牛皮纸档案底色；证物角上贴一张红色证物编号签（证物 001）；画面边缘压一条黄色封条；标题旁盖一枚红色「真相」印章；小字气泡最多一句，放在发现者旁边。",
].join("\n");

const EVIDENCE_REVEAL_RULES_EN = [
  "【Cover style】Evidence Reveal (Style 11), vertical, a piece of evidence file.",
  "【Title】Surface Name = True Name",
  "Title position: top center, spanning the full width, above the evidence.",
  "Title style: title spans over 90% of the width, slightly tilted. Main title in huge bold white letters with thick black outline; \"=\" as a red starburst badge slanted in the middle, white outline with yellow star sparkles; the true name one size larger than the surface name, in gold gradient letters with red outline, like a truth label; the surface name in white with black outline, smaller than the true name.",
  "【Evidence】One key prop in hyper-realistic close-up at the center, taking 40-50% of the frame, lit by a spotlight, with white outline or evidence frame.",
  "【Surface / Truth labels】Above the evidence a surface-identity label (small text, white background, gray text: what it looks like); below it a true-identity label (large text, red or gold background: what it really is), separated by a red torn line; the truth label must outrank the surface label in size, color and background.",
  "【Character positions】This cover must use the attached character asset images. The characters must all appear in the frame, standing on either side of the evidence — none may be missing. Faces and overall styling must strictly match the character asset images, never change; never invent a person, never swap faces; outfits follow the asset images by default, adjustable if the scene needs.",
  "1-2 leads stand on either side of the evidence, half-body, under a quarter of the frame, shocked at the reveal or dumbfounded, pointing at the evidence; never take the center, never fill the frame with a face.",
  "【File elements】Dark gray or kraft-paper file background; a red evidence tag on the corner (Evidence 001); a yellow seal tape along the edge; a red \"TRUTH\" stamp next to the title; at most one small speech bubble next to the discoverer.",
].join("\n");

export const COVER_STYLES: CoverStyleDef[] = [
{
id: "explosive_vs",
label: "风格1 · 爆款VS对抗",
shortDesc:
"巨型描边大字压顶 + VS 爆炸徽章 + 真人抠图拼贴 + 主题特效填满画面（参考图同款）",
analysisSummary:
"来自你给的参考拼图（野生狗奶系列 12 张封面）：11 张对抗式、1 张口号式，共享同一套视觉语言——标题即海报、冲突即构图、特效即信息。这套风格不追求好看高级，追求在信息流里 0.5 秒抓住眼球：先读标题知道谁打谁，再看道具与特效知道为什么打。",
traits: EXPLOSIVE_VS_TRAITS,
rulesZh: EXPLOSIVE_VS_RULES_ZH,
rulesEn: EXPLOSIVE_VS_RULES_EN,
negativeZh:
"不要：极简留白、低饱和灰调、单人定妆照、平静表情、小字号标题、整齐对称的证件照排版、水印、无关文字与乱码文字。",
negativeEn:
"Avoid: minimalism and negative space, desaturated gray tones, single-character posed poster, calm expressions, small title text, symmetric ID-photo layout, watermarks, unrelated or garbled text.",
shortNameZh: "爆款VS对抗",
shortNameEn: "Explosive VS Showdown",
digestZh:
"真人抠图拼贴、大头白描边、夸张表情、道具中央放大、特效填满、密度拉满",
digestEn:
"photo-cutout collage, big heads, white outline, peak expressions, effects filling every gap",
paletteZh:
"亮黄+红橙 对 天蓝/冰蓝，高饱和补色对撞，白飞溅过渡，黑只作描边",
paletteEn:
"bright yellow + red-orange vs sky/ice blue, high-saturation clash, white splashes, black for outlines only",
negativeShortZh:
"极简留白、低饱和灰调、平静表情、单人定妆照、小字标题、水印、乱码文字",
negativeShortEn:
"minimalism, grays, calm faces, ID-photo poses, small title, watermarks, garbled text",
},
{
id: "face_meme",
label: "风格2 · 怼脸梗贴纸",
shortDesc:
"面部夸张表情特写怼满画面 + 巨型梗标题占顶三分之一 + 3–6 个梗贴纸环绕（单集梗 / 人物向）",
analysisSummary:
"来自你认可的 11 张封面里的第 2 类（《送给朋友的祝福》《上课时唱网络热梗》《爱慕杰的爸爸叫爱建国》《方便面哲学》）：不讲对抗、讲一个人一个梗——一张夸张的脸怼满画面，梗标题压顶，贴纸把笑点直接贴在人物周围，观众不用读剧情就先笑出来。",
traits: FACE_MEME_TRAITS,
rulesZh: FACE_MEME_RULES_ZH,
rulesEn: FACE_MEME_RULES_EN,
negativeZh:
"不要：平静表情、证件照站姿、小字号标题、低饱和灰调、极简留白、人物太小、贴纸盖住脸、水印、无关文字与乱码文字。",
negativeEn:
"Avoid: calm expressions, ID-photo poses, small title text, desaturated gray tones, minimalism and negative space, tiny characters, stickers covering the face, watermarks, unrelated or garbled text.",
shortNameZh: "怼脸梗贴纸",
shortNameEn: "Face Meme Stickers",
digestZh:
"面部夸张表情特写怼满画面、人物占一半以上、标题黄底黑边3D倾斜加爆炸底衬、四周贴3–6个梗贴纸、高饱和波普漫画风",
digestEn:
"extreme close-up exaggerated face filling half the frame, giant yellow black-outlined 3D title on an explosion backing, 3-6 meme stickers around the face, high-saturation pop-comic colors",
paletteZh:
"高饱和黄红蓝，粗黑描边，波普漫画配色",
paletteEn:
"high-saturation yellow/red/blue, thick black outlines, pop-comic palette",
negativeShortZh:
"平静表情、小字标题、低饱和灰调、人物太小、贴纸盖脸、水印、乱码文字",
negativeShortEn:
"calm faces, small title, grays, tiny characters, stickers over the face, watermarks, garbled text",
forceLayout: "slogan",
analysisGuideZh:
"本风格固定用 slogan 版式（layoutType 必须填 slogan，sideA / sideB 留空）：mainTitle 写一句口语梗化的短标题（从剧本最抓人的梗来，尽量 10 字以内）；mainCharacters 只选 1–2 位表情最有戏的主角；characterPoses 只写面部夸张表情特写（哭 / 喊 / 笑 / 震惊做到峰值）加一个指向性动作，不写左右对峙；keyProp 写最能代表这个梗的一件道具或物件，并写清它在人物旁的动势；effectTheme 写人物四周的贴纸元素（红 X、气泡框、音符、星星、闪电、表情包小人，要与标题梗点呼应）；hookLine 与 bubbleLines 照常从真实台词里挑。签名版照常先定：effects 写贴纸元素（最多 2 个），propAnchor 写核心道具，backgroundKeyword 只给场景一个词。",
compositionZh:
"通用构图（同一份提示词适用于 16:9 横版、3:4 竖版、4:3 横版，不为单一画幅写死）：主标题横贯画面顶部约三分之一；一位或两位主角的面部夸张表情特写占据标题下方主体区域、人物占画面二分之一以上，脸是第一视觉焦点；3–6 个梗元素贴纸环绕人物分布、不盖脸；背景是剧情场景、虚化退后。无论横竖画幅，标题与人物脸都不得被裁切、不得被挤到角落。",
compositionEn:
"Universal composition (one prompt works for 16:9 landscape, 3:4 portrait and 4:3 landscape — never hard-coded to a single frame): the main title spans the top third; one or two leads in extreme facial close-up fill the area below it, characters taking at least half the frame, the face as the first focal point; 3-6 meme stickers spread around the characters, never covering the face; background is the story's scene, blurred back. In any orientation the title and the faces must never be cropped or pushed into a corner.",
titleLineZh: (plan) =>
`主标题（必须逐字出现在画面顶部约三分之一）：「${plan.mainTitle}」——超大字号，黄字黑描边加彩色投影、3D 倾斜，背后垫爆炸形底衬，关键词可用红色突出。`,
titleLineEn: (plan) =>
`Main title (must appear across the top third, exact Chinese characters): "${plan.mainTitle}" — extra-large yellow letters, thick black outline, colored drop shadow, 3D tilt, explosion-shaped backing, keyword may be highlighted in red.`,
shortTitleLineZh: (_plan, title) =>
`主标题「${title}」置顶约三分之一全宽、超大字号、黄底黑边加彩色投影、3D 倾斜、背后爆炸形底衬、逐字准确；标题下方是面部夸张表情特写，人物占画面一半以上。`,
shortTitleLineEn: (_plan, title) =>
`Title "${title}" (exact Chinese characters) across the top third, extra-large yellow letters, black outline, colored shadow, 3D tilt, explosion backing; below it an extreme close-up exaggerated face filling at least half the frame.`,
shortExtraZh:
"贴纸：人物四周贴 3–6 个梗元素贴纸（红X标记、气泡框、音符星星闪电、表情包式小人），与标题梗点呼应，不盖脸。",
shortExtraEn:
"Stickers: 3-6 meme stickers around the face (red X marks, speech bubbles, music notes, stars, lightning, meme figures) echoing the title's gag, never covering the face.",
propShortHintZh: "在人物旁放大呈现",
propShortHintEn: "shown enlarged beside the face",
propLabelZh: "核心道具（人物旁放大，或最能代表梗点的物件）",
propLabelEn: "Key prop (enlarged beside the character, or the object that best carries the gag)",
effectsLabelZh: "贴纸与特效（人物四周 3–6 个，与标题梗点呼应）",
effectsLabelEn: "Stickers and effects (3-6 around the characters, echoing the title's gag)",
},
{
id: "collage_memory",
label: "风格3 · 拼贴回忆",
shortDesc:
"3–5 个小场景撕纸拼贴 + 每格一个梗点配小字标注 + 暖色怀旧基调（回忆系列 / 合集）",
analysisSummary:
"来自你认可的 11 张封面里的第 3 类（《小时候我以为的那些事》《小时候以为的事》《小时候开智前做过的事》）：讲的不是一个瞬间、是一组回忆——多格拼贴天然带合集感，撕纸边缘像从旧相册里撕下来的几页，暖色基调负责怀旧，高饱和标题与贴纸负责抓眼。",
traits: COLLAGE_MEMORY_TRAITS,
rulesZh: COLLAGE_MEMORY_RULES_ZH,
rulesEn: COLLAGE_MEMORY_RULES_EN,
negativeZh:
"不要：单一大场景、整齐网格排版、冷色灰调、低饱和、小字号标题、平静表情、水印、无关文字与乱码文字。",
negativeEn:
"Avoid: a single large scene, neat grid layout, cold gray tones, desaturation, small title text, calm expressions, watermarks, unrelated or garbled text.",
shortNameZh: "拼贴回忆",
shortNameEn: "Collage Memories",
digestZh:
"3–5个小场景撕纸拼贴错落排布、每格一个梗点配小字标注、标题黄底黑边3D倾斜加爆炸底衬、暖色怀旧基调加高饱和点缀",
digestEn:
"3-5 small scenes in a torn-paper collage, one gag per cell with a small caption, giant yellow black-outlined 3D title on an explosion backing, warm nostalgic base with high-saturation accents",
paletteZh:
"暖色怀旧基调（暖黄、旧纸色）打底，高饱和红蓝黄点缀，粗描边",
paletteEn:
"warm nostalgic base (warm yellow, old-paper tones) with high-saturation red/blue/yellow accents, thick outlines",
negativeShortZh:
"单一场景、整齐网格、冷灰调、低饱和、小字标题、水印、乱码文字",
negativeShortEn:
"single scene, neat grid, cold grays, desaturation, small title, watermarks, garbled text",
forceLayout: "slogan",
analysisGuideZh:
"本风格固定用 slogan 版式（layoutType 必须填 slogan，sideA / sideB 留空）：mainTitle 写回忆系列的短标题（「小时候……」式合称，口语梗化）；mainCharacters 选 2–4 位、分布到各小格；characterPoses 逐格写清——每格一个小场景、一个梗点或回忆点、格内人物的表情与动作；keyProp 写最具代表性的一件回忆物、注明它出现在哪一格；effectTheme 写撕纸 / 锯齿边缘与格间小贴纸点缀；bubbleLines 可用作格旁小字标注（如「爆笑回忆」「童年迷惑行为」），从剧本梗点里来。签名版照常先定：effects 写拼贴点缀（最多 2 个），backgroundKeyword 只给怀旧场景一个词。",
compositionZh:
"通用构图（同一份提示词适用于 16:9 横版、3:4 竖版、4:3 横版，不为单一画幅写死）：主标题横贯画面顶部约三分之一；标题下方 3–5 个小场景以纸张撕裂或锯齿边缘分隔、错落排布拼贴，每格一个梗点或回忆点、格旁配小字标注；各格人物以中近景出现、表情夸张。无论横竖画幅，标题不得被裁切，任何一格不得被挤没。",
compositionEn:
"Universal composition (one prompt works for 16:9 landscape, 3:4 portrait and 4:3 landscape — never hard-coded to a single frame): the main title spans the top third; below it 3-5 small scenes in a collage separated by torn-paper or jagged edges, staggered, one gag or memory point per cell with a small caption beside it; characters in medium close-up with exaggerated expressions. In any orientation the title must never be cropped and no cell may be squeezed away.",
titleLineZh: (plan) =>
`主标题（必须逐字出现在画面顶部约三分之一）：「${plan.mainTitle}」——超大字号，黄字黑描边加彩色投影、3D 倾斜，背后垫爆炸形底衬，关键词可用红色突出。`,
titleLineEn: (plan) =>
`Main title (must appear across the top third, exact Chinese characters): "${plan.mainTitle}" — extra-large yellow letters, thick black outline, colored drop shadow, 3D tilt, explosion-shaped backing, keyword may be highlighted in red.`,
shortTitleLineZh: (_plan, title) =>
`主标题「${title}」置顶约三分之一全宽、超大字号、黄底黑边加彩色投影、3D 倾斜、背后爆炸形底衬、逐字准确；标题下方是 3–5 个小场景的撕纸拼贴。`,
shortTitleLineEn: (_plan, title) =>
`Title "${title}" (exact Chinese characters) across the top third, extra-large yellow letters, black outline, colored shadow, 3D tilt, explosion backing; below it a torn-paper collage of 3-5 small scenes.`,
shortExtraZh:
"拼贴：3–5 个小场景以撕纸/锯齿边缘分隔、错落排布，每格一个梗点，格旁小字标注（如「爆笑回忆」「童年迷惑行为」）。",
shortExtraEn:
"Collage: 3-5 small scenes separated by torn-paper / jagged edges, staggered layout, one gag per cell with a small caption beside it (e.g. 爆笑回忆， 童年迷惑行为 — exact Chinese characters).",
propShortHintZh: "在它所在的小格里放大呈现",
propShortHintEn: "shown enlarged inside its collage cell",
propLabelZh: "代表性回忆物（出现在对应小格里）",
propLabelEn: "Signature memory object (appears inside its collage cell)",
effectsLabelZh: "拼贴点缀（撕纸边缘、星星问号等小贴纸）",
effectsLabelEn: "Collage dressing (torn-paper edges, small stickers like stars and question marks)",
},
{
id: "panorama_story",
label: "风格4 · 全景故事感",
shortDesc:
"一个场景的全景群像、最有戏的一幕 + 大标题压顶或压底（单集梗 · 明确场景 + 2 人以上群像）",
analysisSummary:
"适合\"一个场景里好几个人正在干一件荒诞事\"的单集，封面就是剧里最有戏的一幕全景，人物在场景里、标题压在顶部或底部。学自 1000+ 赞封面的版式：21 张点赞 1000+ 的采集封面亲眼分析分类里的「全景场景+人物」一类（6 张）。",
traits: PANORAMA_STORY_TRAITS,
rulesZh: PANORAMA_STORY_RULES_ZH,
rulesEn: PANORAMA_STORY_RULES_EN,
negativeZh:
"不要：水印、平台 UI、单人独白式特写、拼贴分格、标题缺失或字号过小、人物抠图贴纸感、无关文字与乱码文字。",
negativeEn:
"Avoid: watermarks, platform UI, single-person monologue close-ups, collage panels, missing or small title text, cutout-sticker look, unrelated or garbled text.",
shortNameZh: "全景故事感",
shortNameEn: "Panorama Story",
digestZh:
"场景全景群像、人物在场景里干一件荒诞事、大标题压顶或压底、超写实真人实拍电影质感自然光",
digestEn:
"wide-shot group scene, characters inside the scene doing one absurd thing, large title at top or bottom, hyper-realistic cinematic natural light",
paletteZh:
"标题关键词着色、其余白色、黑色粗描边；画面自然光色调",
paletteEn:
"title keyword in color, rest white, thick black outline; natural-light tones",
negativeShortZh:
"水印、平台 UI、单人特写、拼贴分格、小字标题、乱码文字",
negativeShortEn:
"watermarks, platform UI, single-person close-up, collage panels, small title, garbled text",
forceLayout: "slogan",
analysisGuideZh:
"本风格固定用 slogan 版式（layoutType 必须填 slogan，sideA / sideB 留空）：mainTitle 写这一集的大标题（从全剧最有戏的那一幕来）；mainCharacters 选 2–4 位同场人物（全景群像，2 人以上）；characterPoses 写清这群人在同一个场景里正在干的那件事——每人一个动作、表情峰值，不写左右对峙、不写单人特写；backgroundScene 只写一个明确场景（教室 / 食堂 / 医院 / 户外等，与剧情呼应），全景靠它撑满画面；keyProp 写这幕戏里最关键的一件道具或物件及它的动势；effectTheme 写场景的自然光与电影质感氛围，不堆贴纸与爆炸特效；hookLine 与 bubbleLines 照常从真实台词里挑（可少放）。签名版照常先定：backgroundKeyword 只给场景一个词，effects 写氛围元素（最多 2 个），focusLine 写全景里最有戏的那一个点。",
compositionZh:
"通用构图（同一份提示词适用于 16:9 横版、3:4 竖版、4:3 横版，不为单一画幅写死）：一个明确场景的全景铺满全幅，2 位以上人物在场景里同框、正在做一件事，人物与场景共同构成画面主体（超写实真人实拍、电影质感、自然光）；大标题压在顶部或底部、占画面上部约三分之一。无论横竖画幅，标题不得被裁切，人物不得被挤出画面。",
compositionEn:
"Universal composition (one prompt works for 16:9 landscape, 3:4 portrait and 4:3 landscape — never hard-coded to a single frame): one clear scene in a wide shot filling the whole frame, two or more characters inside the scene doing one thing together, characters and scene sharing the frame (hyper-realistic live-action, cinematic, natural light); the large title sits at the top or bottom, occupying about one third of the frame. In any orientation the title must never be cropped and the characters must never be pushed out of the frame.",
titleLineZh: (plan) =>
`主标题（必须逐字出现在画面顶部或底部）：「${plan.mainTitle}」——大字号，关键词可用醒目颜色突出、其余白色，黑色粗描边；标题占画面上部约三分之一。`,
titleLineEn: (plan) =>
`Main title (must appear at the top or bottom, exact Chinese characters): "${plan.mainTitle}" — large letters, keyword may be highlighted in a bold color, rest in white, thick black outline; title occupies about one third of the frame.`,
shortTitleLineZh: (_plan, title) =>
`主标题「${title}」置于顶部或底部、大字号、关键词着色其余白色、黑色粗描边、逐字准确，占画面约三分之一；画面是一个场景的全景群像。`,
shortTitleLineEn: (_plan, title) =>
`Title "${title}" (exact Chinese characters) at the top or bottom, large letters, keyword in color, rest white, thick black outline, about one third of the frame; the image is a wide group scene in one location.`,
propShortHintZh: "在全景画面里自然呈现",
propShortHintEn: "shown naturally inside the wide scene",
propLabelZh: "关键道具（这幕全景里最关键的那件）",
propLabelEn: "Key prop (the most important object in this scene)",
effectsLabelZh: "场景氛围（自然光、电影质感的光影）",
effectsLabelEn: "Scene atmosphere (natural light, cinematic lighting)",
},
{
id: "solo_half_title",
label: "风格5 · 单人半身大标题",
shortDesc:
"单主角半身出镜、表情夸张 + 顶部一句大标题（单主角单集梗）",
analysisSummary:
"适合\"一个人一个梗\"的单集，一个人半身出镜、表情夸张，上面压一句大标题，干净利落。学自 1000+ 赞封面的版式：21 张点赞 1000+ 的采集封面亲眼分析分类里的「单人+大标题」一类（3 张）。",
traits: SOLO_HALF_TITLE_TRAITS,
rulesZh: SOLO_HALF_TITLE_RULES_ZH,
rulesEn: SOLO_HALF_TITLE_RULES_EN,
negativeZh:
"不要：水印、平台 UI、多人对峙、多线拼贴、标题字号过小、背景不虚化抢焦点、平静表情、无关文字与乱码文字。",
negativeEn:
"Avoid: watermarks, platform UI, multi-character face-offs, multi-panel collage, small title text, unblurred busy background, calm expressions, unrelated or garbled text.",
shortNameZh: "单人半身大标题",
shortNameEn: "Solo Half-Body Title",
digestZh:
"单主角半身居中偏下、表情夸张、顶部大标题占三分之一到四成、背景虚化",
digestEn:
"single lead in half-body, lower center, exaggerated expression, large title across the top third to two fifths, blurred background",
paletteZh:
"标题关键词特大字、其余白色、黑色粗描边",
paletteEn:
"title keyword extra large, rest white, thick black outline",
negativeShortZh:
"水印、平台 UI、多人对峙构图、小字标题、背景抢焦点、乱码文字",
negativeShortEn:
"watermarks, platform UI, multi-character face-off layout, small title, busy background, garbled text",
forceLayout: "slogan",
analysisGuideZh:
"本风格固定用 slogan 版式（layoutType 必须填 slogan，sideA / sideB 留空）：mainTitle 写一句大标题（从剧本最抓人的梗来，尽量 10 字以内）；mainCharacters 只选 1 位主角；characterPoses 只写这位主角的半身夸张表情（哭 / 喊 / 笑 / 震惊做到峰值）加一个指向性动作——表情动作本身就是笑点，不写多人对峙；backgroundScene 写主角所在的场景（画面里虚化退后，只交代环境）；keyProp 写主角手里或身边最能代表这个梗的一件道具，没有道具时写主角的标志性随身物；effectTheme 写背景虚化与光影氛围，不堆贴纸。签名版照常先定：chars 只写这位主角一人，backgroundKeyword 只给场景一个词。",
compositionZh:
"通用构图（同一份提示词适用于 16:9 横版、3:4 竖版、4:3 横版，不为单一画幅写死）：一位主角半身出镜、居中偏下，夸张表情与动作是画面主体；顶部大标题占画面上部约三分之一到四成；背景是剧情场景、虚化退后。无论横竖画幅，标题与主角的脸都不得被裁切。",
compositionEn:
"Universal composition (one prompt works for 16:9 landscape, 3:4 portrait and 4:3 landscape — never hard-coded to a single frame): one lead in half-body at lower center, exaggerated expression and gesture as the subject; the large title occupies the top third to two fifths; background is the story's scene, blurred back. In any orientation the title and the lead's face must never be cropped.",
titleLineZh: (plan) =>
`主标题（必须逐字出现在画面顶部）：「${plan.mainTitle}」——关键词用特大字、其余白色，黑色粗描边；标题占画面上部约三分之一到四成。`,
titleLineEn: (plan) =>
`Main title (must appear across the top, exact Chinese characters): "${plan.mainTitle}" — keyword in extra-large letters, rest in white, thick black outline; title occupies about one third to two fifths of the frame.`,
shortTitleLineZh: (_plan, title) =>
`主标题「${title}」置顶、关键词特大字其余白色、黑色粗描边、逐字准确，占画面上部约三分之一到四成；标题下方是单主角半身出镜、表情夸张，背景虚化。`,
shortTitleLineEn: (_plan, title) =>
`Title "${title}" (exact Chinese characters) across the top, keyword extra large, rest white, thick black outline, about one third to two fifths of the frame; below it one lead in half-body with an exaggerated expression, background blurred.`,
propShortHintZh: "在主角手边自然呈现",
propShortHintEn: "shown naturally beside the lead",
propLabelZh: "核心道具（主角手里或身边的标志物）",
propLabelEn: "Key prop (the signature object in the lead's hand or beside them)",
effectsLabelZh: "背景氛围（虚化背景与光影）",
effectsLabelEn: "Background atmosphere (blur and lighting)",
},
{
id: "poster_sticker_bomb",
label: "风格6 · 海报式贴纸轰炸",
shortDesc:
"顶部超大标题 + 人物道具气泡贴纸放射线全堆上（梗密单集 · 风格2 的细化）",
analysisSummary:
"适合\"梗特别密、东西特别多\"的单集，顶部超大标题打头，人物、道具、气泡、贴纸、放射线全堆上去，热闹得像一张手绘海报。学自 1000+ 赞封面的版式：21 张点赞 1000+ 的采集封面亲眼分析分类里的「竖版海报式大标题」一类（4 张）；是对风格2「怼脸梗贴纸」的细化。",
traits: POSTER_STICKER_BOMB_TRAITS,
rulesZh: POSTER_STICKER_BOMB_RULES_ZH,
rulesEn: POSTER_STICKER_BOMB_RULES_EN,
negativeZh:
"不要：水印、平台 UI、极简留白、严肃悬念温情气质、贴纸与标题梗点无关、贴纸盖住人脸、标题字号不够大、无关文字与乱码文字。",
negativeEn:
"Avoid: watermarks, platform UI, minimalism and empty space, serious/suspense/warm mood, stickers unrelated to the title's gag, stickers covering faces, undersized title, unrelated or garbled text.",
shortNameZh: "海报式贴纸轰炸",
shortNameEn: "Poster Sticker Bomb",
digestZh:
"顶部超大标题打头、中部人物道具多方反应堆满、漫画贴纸气泡放射线叠加、海报式热闹",
digestEn:
"extra-large title on top, characters props and reactions packed in the center, comic stickers speech bubbles and radiating lines overlaid, poster-like density",
paletteZh:
"标题关键词着色、其余白色、黑色粗描边；主色调鲜明高饱和",
paletteEn:
"title keyword in color, rest white, thick black outline; bold high-saturation dominant colors",
negativeShortZh:
"水印、平台 UI、画面留白空旷、贴纸与梗点无关、小字标题、乱码文字",
negativeShortEn:
"watermarks, platform UI, empty negative space, stickers unrelated to the gag, small title, garbled text",
forceLayout: "slogan",
analysisGuideZh:
"本风格固定用 slogan 版式（layoutType 必须填 slogan，sideA / sideB 留空）：mainTitle 写标题本身就是梗的那句大标题（口语梗化、从剧本最密的梗点来）；mainCharacters 选 1–4 位（中部画面的人物与多方反应）；characterPoses 写中部画面里人物、道具与多方反应怎么堆（谁拿着标志性道具、谁在旁边什么反应）；keyProp 写最有标志性的那件道具（梗的视觉锚点）；effectTheme 写叠加的漫画贴纸元素（对话气泡、梗贴纸、放射线，逐项点名并与标题梗点呼应）；bubbleLines 用作贴纸气泡里的台词，从真实台词里挑。签名版照常先定：effects 写贴纸元素（最多 2 个），propAnchor 写标志性道具。",
compositionZh:
"通用构图（同一份提示词适用于 16:9 横版、3:4 竖版、4:3 横版，不为单一画幅写死）：顶部超大标题打头；中部把人物、标志性道具与多方反应堆满，像一张手绘海报；漫画贴纸元素（对话气泡、梗贴纸、放射线）叠加在画面上、与标题梗点呼应。无论横竖画幅，标题不得被裁切，贴纸不得盖住人脸。",
compositionEn:
"Universal composition (one prompt works for 16:9 landscape, 3:4 portrait and 4:3 landscape — never hard-coded to a single frame): an extra-large title heads the top; the center is packed with characters, the signature prop and multiple reactions, like a hand-drawn poster; comic sticker elements (speech bubbles, gag stickers, radiating lines) are overlaid, echoing the title's gag. In any orientation the title must never be cropped and stickers must never cover faces.",
titleLineZh: (plan) =>
`主标题（必须逐字出现在画面顶部）：「${plan.mainTitle}」——超大字号，关键词可用醒目颜色突出、其余白色，黑色粗描边。`,
titleLineEn: (plan) =>
`Main title (must appear across the top, exact Chinese characters): "${plan.mainTitle}" — extra-large letters, keyword may be highlighted in a bold color, rest in white, thick black outline.`,
shortTitleLineZh: (_plan, title) =>
`主标题「${title}」置顶超大字号、关键词着色其余白色、黑色粗描边、逐字准确；中部人物、道具与多方反应堆满，贴纸气泡放射线叠加。`,
shortTitleLineEn: (_plan, title) =>
`Title "${title}" (exact Chinese characters) extra-large across the top, keyword in color, rest white, thick black outline; center packed with characters, props and reactions, stickers, bubbles and radiating lines overlaid.`,
shortExtraZh:
"贴纸轰炸：对话气泡、梗贴纸、放射线等漫画贴纸元素叠满画面，与标题梗点呼应，不盖人脸。",
shortExtraEn:
"Sticker overload: speech bubbles, gag stickers and radiating lines layered over the image, echoing the title's gag, never covering faces.",
propShortHintZh: "在中部画面里放大呈现",
propShortHintEn: "shown enlarged in the center",
propLabelZh: "标志性道具（中部画面里最抢眼的那件）",
propLabelEn: "Signature prop (the most eye-catching object in the center)",
effectsLabelZh: "贴纸元素（对话气泡、梗贴纸、放射线，与标题梗点呼应）",
effectsLabelEn: "Sticker elements (speech bubbles, gag stickers, radiating lines, echoing the title's gag)",
},
{
id: "multi_panel_story",
label: "风格7 · 多格故事拼贴",
shortDesc:
"一大组群像主画面 + 两张小画面白边拼贴（多名场面单集 · 风格3 的推广）",
analysisSummary:
"适合\"一集里好几个名场面\"的单集，一个大主画面加两三张小画面拼在一起，等于把全集高光提前剧透一遍；③拼贴回忆只管小时候回忆，这款管所有多线叙事。学自 1000+ 赞封面的版式：21 张点赞 1000+ 的采集封面亲眼分析分类里的「群像拼贴」一类（5 张）；是对风格3「拼贴回忆」的推广。",
traits: MULTI_PANEL_STORY_TRAITS,
rulesZh: MULTI_PANEL_STORY_RULES_ZH,
rulesEn: MULTI_PANEL_STORY_RULES_EN,
negativeZh:
"不要：水印、平台 UI、单一大场景、撕纸/锯齿边缘分格、格子过多过碎、标题字号过小、无关文字与乱码文字。",
negativeEn:
"Avoid: watermarks, platform UI, one single large scene, torn-paper or jagged panel edges, too many tiny panels, small title text, unrelated or garbled text.",
shortNameZh: "多格故事拼贴",
shortNameEn: "Multi-Panel Story Collage",
digestZh:
"上部一大组群像主画面、下部并排两张小画面、白色边框分格、顶部大标题",
digestEn:
"one large group main image on top, two small images side by side below, white borders between panels, large title at the top",
paletteZh:
"标题关键词着色、其余白色、黑色粗描边；各格白色边框",
paletteEn:
"title keyword in color, rest white, thick black outline; white panel borders",
negativeShortZh:
"水印、平台 UI、单场景单画面、撕纸边缘、小字标题、乱码文字",
negativeShortEn:
"watermarks, platform UI, single-scene single image, torn-paper edges, small title, garbled text",
forceLayout: "slogan",
analysisGuideZh:
"本风格固定用 slogan 版式（layoutType 必须填 slogan，sideA / sideB 留空）：mainTitle 写这一集的大标题（多线叙事的合称，口语梗化）；mainCharacters 选 2–4 位、分布到主画面与两张小画面；characterPoses 逐格写清——上部主画面是哪组群像名场面、下部两张小画面各是哪一幕（三格各一个名场面，格内人物表情与动作明确）；keyProp 写最具代表性的一件道具、注明它出现在哪一格；effectTheme 写白色边框分格与小画面里的气泡小字点缀（不用撕纸边缘，那是风格3 的口径）；bubbleLines 用作小画面内的气泡小字，从剧本梗点里来。签名版照常先定：backgroundKeyword 给主画面的场景一个词，effects 写分格点缀（最多 2 个）。",
compositionZh:
"通用构图（同一份提示词适用于 16:9 横版、3:4 竖版、4:3 横版，不为单一画幅写死）：顶部大标题；上部一大组群像主画面，下部并排两张小画面，各格之间白色边框分隔；小画面内可配气泡小字。无论横竖画幅，标题不得被裁切，任何一格不得被挤没。",
compositionEn:
"Universal composition (one prompt works for 16:9 landscape, 3:4 portrait and 4:3 landscape — never hard-coded to a single frame): large title at the top; one large group main image in the upper area, two small images side by side below, white borders between panels; small images may carry speech-bubble text. In any orientation the title must never be cropped and no panel may be squeezed away.",
titleLineZh: (plan) =>
`主标题（必须逐字出现在画面顶部）：「${plan.mainTitle}」——大字号，关键词可用醒目颜色突出、其余白色，黑色粗描边。`,
titleLineEn: (plan) =>
`Main title (must appear across the top, exact Chinese characters): "${plan.mainTitle}" — large letters, keyword may be highlighted in a bold color, rest in white, thick black outline.`,
shortTitleLineZh: (_plan, title) =>
`主标题「${title}」置顶大字号、关键词着色其余白色、黑色粗描边、逐字准确；下方上部一大组群像主画面、下部并排两张小画面，白色边框分格。`,
shortTitleLineEn: (_plan, title) =>
`Title "${title}" (exact Chinese characters) large across the top, keyword in color, rest white, thick black outline; below it one large group main image on top and two small images side by side, white borders between panels.`,
shortExtraZh:
"分格：一大两小——上部群像主画面、下部并排两张小画面，白色边框分隔，小画面内可配气泡小字。",
shortExtraEn:
"Panels: one large group main image on top, two small images side by side below, white borders between panels, small images may carry speech-bubble text.",
propShortHintZh: "在它所在的那一格里呈现",
propShortHintEn: "shown inside its panel",
propLabelZh: "代表性道具（出现在主画面或对应小格里）",
propLabelEn: "Signature prop (appears in the main image or its panel)",
effectsLabelZh: "分格点缀（白色边框、气泡小字）",
effectsLabelEn: "Panel dressing (white borders, speech-bubble text)",
},
{
id: "camps_vs",
label: "风格8 · 多方阵营 VS",
shortDesc:
"左右两方阵营带人带道具对峙 + 中央大 VS（对抗单集 · 风格1 的变体）",
analysisSummary:
"①是两个人对峙，这款是两边各带一帮人、甚至带上标志性道具对峙，适合\"两边阵营掐架\"的单集。学自 1000+ 赞封面的版式：21 张点赞 1000+ 的采集封面亲眼分析分类里的「双人/多方对峙 VS」一类（2 张）；是风格1「爆款VS对抗」的变体扩展。",
traits: CAMPS_VS_TRAITS,
rulesZh: CAMPS_VS_RULES_ZH,
rulesEn: CAMPS_VS_RULES_EN,
negativeZh:
"不要：水印、平台 UI、单人梗构图、温情柔和气质、中央缺 VS、两方标志性人物或道具缺失、标题字号过小、无关文字与乱码文字。",
negativeEn:
"Avoid: watermarks, platform UI, single-person gag layout, warm soft mood, missing central VS, camps without signature characters or props, small title text, unrelated or garbled text.",
shortNameZh: "多方阵营 VS",
shortNameEn: "Multi-Camp VS",
digestZh:
"左右两方阵营各带人物或道具对峙、中央大 VS 黄色星形爆炸底、大标题压底或压顶",
digestEn:
"two camps with their characters or props facing off left vs right, large VS on a yellow starburst in the center, large title at the bottom or top",
paletteZh:
"VS 与标题关键词着色、标题其余白色、黑色粗描边、黄色星形爆炸底",
paletteEn:
"VS and title keyword in color, rest of title white, thick black outline, yellow starburst",
negativeShortZh:
"水印、平台 UI、单人构图、温情气质、没有 VS 徽章、小字标题、乱码文字",
negativeShortEn:
"watermarks, platform UI, single-person layout, warm mood, missing VS badge, small title, garbled text",
analysisGuideZh:
"本风格的左右对峙写在画面结构里，标题是独立的一句大标题（layoutType 填 slogan，不要用 vs 版式把阵营名拼进标题）：sideA 写左方阵营的短名（这一方的标志性人物或道具），sideB 写右方阵营的短名——这两项只作画面左右结构用、不拼进主标题；mainTitle 另写压在底部（或顶部）的大标题全文（两方掐架的钩子句，不是「左 VS 右」合称）；mainCharacters 选 2–4 位、按左右两方分组；characterPoses 按左右两方写清各自的标志性人物或道具与对峙姿态；keyProp 写对峙的核心争夺物或最有代表性的一件阵营道具；effectTheme 写中央 VS 的黄色星形爆炸底与对峙气氛；hookLine 与 bubbleLines 照常从真实台词里挑。签名版照常先定：titleShort 写大标题短语，effects 写爆炸底等点缀（最多 2 个）。",
compositionZh:
"通用构图（同一份提示词适用于 16:9 横版、3:4 竖版、4:3 横版，不为单一画幅写死）：左方一整方阵营（人物或标志性道具）、右方一整方阵营，中央一个大\"VS\"（黑色粗描边、黄色星形爆炸底）；大标题压在底部或顶部。无论横竖画幅，标题与中央 VS 都不得被裁切，两方不得混站。",
compositionEn:
"Universal composition (one prompt works for 16:9 landscape, 3:4 portrait and 4:3 landscape — never hard-coded to a single frame): one whole camp on the left (characters or signature props), one whole camp on the right, a large \"VS\" in the center (thick black outline, yellow starburst background); the large title sits at the bottom or top. In any orientation the title and the central VS must never be cropped and the two camps must never mix.",
titleLineZh: (plan) =>
plan.sideA && plan.sideB
? `画面结构与主标题：左方阵营「${plan.sideA}」、右方阵营「${plan.sideB}」两方对峙，中央大"VS"（黑色粗描边、黄色星形爆炸底）；主标题（必须逐字出现在画面底部或顶部）：「${plan.mainTitle}」——大字号，关键词可用醒目颜色突出、其余白色，黑色粗描边。`
: `画面结构与主标题：左右两方阵营对峙，中央大"VS"（黑色粗描边、黄色星形爆炸底）；主标题（必须逐字出现在画面底部或顶部）：「${plan.mainTitle}」——大字号，关键词可用醒目颜色突出、其余白色，黑色粗描边。`,
titleLineEn: (plan) =>
plan.sideA && plan.sideB
? `Layout and main title: left camp "${plan.sideA}" vs right camp "${plan.sideB}" facing off, a large "VS" in the center (thick black outline, yellow starburst background); main title (must appear at the bottom or top, exact Chinese characters): "${plan.mainTitle}" — large letters, keyword may be highlighted in a bold color, rest in white, thick black outline.`
: `Layout and main title: two camps facing off left vs right, a large "VS" in the center (thick black outline, yellow starburst background); main title (must appear at the bottom or top, exact Chinese characters): "${plan.mainTitle}" — large letters, keyword may be highlighted in a bold color, rest in white, thick black outline.`,
shortTitleLineZh: (plan, title) =>
plan.sideA && plan.sideB
? `左方「${plan.sideA}」、右方「${plan.sideB}」两方对峙，中央大"VS"黑色粗描边、黄色星形爆炸底；主标题「${title}」置于底部或顶部、大字号、关键词着色其余白色、黑色粗描边、逐字准确。`
: `左右两方阵营对峙，中央大"VS"黑色粗描边、黄色星形爆炸底；主标题「${title}」置于底部或顶部、大字号、关键词着色其余白色、黑色粗描边、逐字准确。`,
shortTitleLineEn: (plan, title) =>
plan.sideA && plan.sideB
? `Left camp "${plan.sideA}" vs right camp "${plan.sideB}", large "VS" in the center with thick black outline on a yellow starburst; title "${title}" (exact Chinese characters) large at the bottom or top, keyword in color, rest white, thick black outline.`
: `Two camps facing off left vs right, large "VS" in the center with thick black outline on a yellow starburst; title "${title}" (exact Chinese characters) large at the bottom or top, keyword in color, rest white, thick black outline.`,
propShortHintZh: "作为对峙核心在画面中央呈现",
propShortHintEn: "shown at the center of the face-off",
propLabelZh: "核心道具（对峙的争夺物或阵营标志道具）",
propLabelEn: "Key prop (the contested object or a camp's signature prop)",
effectsLabelZh: "对峙点缀（中央 VS 的黄色星形爆炸底等）",
effectsLabelEn: "Face-off dressing (the yellow starburst behind the central VS, etc.)",
},
{
id: "spectacle_effect_title",
label: "风格9 · 奇观特效大标题",
shortDesc:
"两行超大标题带主题材质特效 + 木牌副标题 + 中央荒诞奇观 + 前景背影（超现实荒诞设定单集）",
analysisSummary:
"适合\"单集里有一个超现实的荒诞设定\"的视频，标题字本身就带主题材质（冰霜、火焰、水花），标题下面再挂一块木牌写一句副标题，画面中央放一个让人一眼愣住的奇观，前景用人物背影框住画面。学自用户新发的封面《离谱数学题 / 冻住全校？》亲眼分析提炼。",
traits: SPECTACLE_EFFECT_TITLE_TRAITS,
rulesZh: SPECTACLE_EFFECT_TITLE_RULES_ZH,
rulesEn: SPECTACLE_EFFECT_TITLE_RULES_EN,
negativeZh:
"不要：水印、平台 UI、日常对话式平淡画面、温情悬念气质、标题无材质特效、中央奇观缺失或太小、前景无背影框图、无关文字与乱码文字。",
negativeEn:
"Avoid: watermarks, platform UI, flat everyday-dialogue scenes, warm or suspense mood, title without thematic material effect, missing or tiny central spectacle, no foreground back-view framing, unrelated or garbled text.",
shortNameZh: "奇观特效大标题",
shortNameEn: "Spectacle Effect Title",
digestZh:
"两行超大标题带主题材质特效、木牌副标题、中央荒诞奇观居中、前景背影框住全景",
digestEn:
"two-line extra-large title with thematic material effect, wooden-sign subtitle, absurd spectacle centered, foreground characters seen from behind framing a wide shot",
paletteZh:
"标题双色对撞 + 主题材质色（冰蓝/火橙/水青等按主题定），超写实自然光色调",
paletteEn:
"two-color title clash plus thematic material color (ice blue / fire orange / water cyan by theme), hyper-realistic natural-light tones",
negativeShortZh:
"水印、平台 UI、平淡日常画面、标题无材质特效、奇观缺失、乱码文字",
negativeShortEn:
"watermarks, platform UI, flat everyday scene, title without material effect, missing spectacle, garbled text",
forceLayout: "slogan",
analysisGuideZh:
"本风格固定用 slogan 版式（layoutType 必须填 slogan，sideA / sideB 留空）：mainTitle 写顶部两行超大标题的全文（两行合起来就是主标题，如「离谱数学题 冻住全校？」式，从本集荒诞设定来）；hookLine 写木牌上的副标题（一句钩子句，进标题下方的木牌/招牌）；mainCharacters 选前景背对镜头的人物 1–4 位（背影框图用）；characterPoses 写前景人物背对镜头的站位与中央奇观的画面——奇观元素是什么、居中怎么呈现，人物只写背影朝向、不写正脸对峙；keyProp 写中央的荒诞奇观元素本身（本集最让人愣住的那个东西）及其状态；effectTheme 写标题字的主题材质特效（冰霜结晶/积雪/冰柱、火焰、水花等，与奇观主题严格呼应）与环绕标题的装饰元素；backgroundScene 只写一个明确场景（全景靠它撑满画面）；bubbleLines 可少放或不放。签名版照常先定：titleShort 写两行标题短语，propAnchor 写奇观元素，effects 写材质特效（最多 2 个），backgroundKeyword 只给场景一个词，focusLine 写中央奇观。",
compositionZh:
"通用构图（同一份提示词适用于 16:9 横版、3:4 竖版、4:3 横版，不为单一画幅写死）：顶部两行超大标题，字体带主题材质特效、装饰元素环绕；标题下方挂一块木牌/招牌写副标题；画面中部荒诞奇观元素居中；前景人物背对镜头框住画面；背景是场景全景（超写实真人实拍、电影质感、自然光）。无论横竖画幅，标题、木牌与中央奇观都不得被裁切。",
compositionEn:
"Universal composition (one prompt works for 16:9 landscape, 3:4 portrait and 4:3 landscape — never hard-coded to a single frame): extra-large two-line title at the top, letters carrying a thematic material effect, decorative elements around it; below the title a wooden sign / board carrying the subtitle; an absurd spectacle element centered in the middle; foreground characters seen from behind framing the frame; background is a wide shot of the scene (hyper-realistic live-action, cinematic, natural light). In any orientation the title, the sign and the central spectacle must never be cropped.",
titleLineZh: (plan) =>
`主标题（必须逐字出现在画面顶部、两行呈现）：「${plan.mainTitle}」——超大字号、双色，字体带主题材质特效，装饰元素环绕；标题下方木牌副标题（逐字准确）：「${plan.subtitle || "副标题"}」。`,
titleLineEn: (plan) =>
`Main title (must appear across the top in two lines, exact Chinese characters): "${plan.mainTitle}" — extra-large letters in two colors, letters carrying a thematic material effect, decorative elements around; subtitle on the wooden sign below (exact Chinese characters): "${plan.subtitle || "副标题"}".`,
shortTitleLineZh: (_plan, title) =>
`主标题「${title}」置顶两行超大字号、双色、字体带主题材质特效、逐字准确；标题下方木牌写副标题，中央荒诞奇观居中，前景背影框住全景。`,
shortTitleLineEn: (_plan, title) =>
`Title "${title}" (exact Chinese characters) in two extra-large lines across the top, two colors, letters with a thematic material effect; wooden-sign subtitle below, absurd spectacle centered, foreground characters seen from behind framing a wide shot.`,
propShortHintZh: "在画面中央居中呈现",
propShortHintEn: "shown centered in the middle of the frame",
propLabelZh: "荒诞奇观元素（画面中央居中、最让人愣住的那个）",
propLabelEn: "Absurd spectacle element (centered, the most startling thing in the frame)",
effectsLabelZh: "主题材质特效（标题字上的材质 + 环绕装饰元素）",
effectsLabelEn: "Thematic material effect (material on the title letters + surrounding decorations)",
},
{
id: "market_note_quote",
label: "风格10 · 烟火气纸条金句",
shortDesc:
"涂鸦大标题 + 撕纸条金句副标题 + 前景招牌商品特写（市井摊位/小店单集）",
analysisSummary:
"适合\"校门口小摊、小店、市井烟火气\"的单集，大标题上画几笔小涂鸦，标题下面贴一张撕纸条写一句金句，前景再摆一盘招牌商品当视觉锚。学自用户新发的封面《走读生在 / 给我次机会》亲眼分析提炼。",
traits: MARKET_NOTE_QUOTE_TRAITS,
rulesZh: MARKET_NOTE_QUOTE_RULES_ZH,
rulesEn: MARKET_NOTE_QUOTE_RULES_EN,
negativeZh:
"不要：水印、平台 UI、荒诞奇观元素、严肃悬念气质、标题无涂鸦、纸条金句缺失、前景无商品特写、无关文字与乱码文字。",
negativeEn:
"Avoid: watermarks, platform UI, absurd spectacle elements, serious or suspense mood, title without doodles, missing paper-note subtitle, no foreground product close-up, unrelated or garbled text.",
shortNameZh: "烟火气纸条金句",
shortNameEn: "Market Note Quote",
digestZh:
"两行涂鸦大标题、撕纸条金句副标题（关键词红线标出）、前景招牌商品特写、一侧背影",
digestEn:
"two-line title with doodles, torn paper note subtitle with keyword underlined in red, foreground signature product close-up, character seen from behind on one side",
paletteZh:
"标题双色对撞 + 手绘涂鸦色，市井暖调自然光",
paletteEn:
"two-color title clash plus hand-drawn doodle colors, warm market natural-light tones",
negativeShortZh:
"水印、平台 UI、荒诞奇观、严肃悬念气质、无涂鸦标题、无商品特写、乱码文字",
negativeShortEn:
"watermarks, platform UI, absurd spectacle, serious suspense mood, title without doodles, no product close-up, garbled text",
forceLayout: "slogan",
analysisGuideZh:
"本风格固定用 slogan 版式（layoutType 必须填 slogan，sideA / sideB 留空）：mainTitle 写顶部两行超大标题的全文（两行合起来就是主标题，从本集市井梗来）；hookLine 写撕纸条上的副标题金句（一句最有梗的话，关键词在拼词时用红色下划线标出）；mainCharacters 选摊位/小店里的人物 1–3 位（含一侧背对镜头的人物）；characterPoses 写摊位/小店场景里人物在干什么、一侧人物背对镜头的站位，不写荒诞奇观、不写对峙；keyProp 写前景的招牌商品或食物（视觉锚点，要能拍特写的那盘/那件）；effectTheme 写标题旁的涂鸦装饰（纸飞机、爱心、星星等，逐项点名）与市井烟火气氛围；backgroundScene 写摊位/小店场景与背景招牌/菜单；bubbleLines 可少放或不放。签名版照常先定：titleShort 写两行标题短语，propAnchor 写招牌商品，effects 写涂鸦元素（最多 2 个），backgroundKeyword 给摊位场景一个词。",
compositionZh:
"通用构图（同一份提示词适用于 16:9 横版、3:4 竖版、4:3 横版，不为单一画幅写死）：顶部两行超大标题配涂鸦装饰；标题下方贴一张撕纸条写副标题金句（关键词红色下划线）；中部是摊位/小店场景，前景招牌商品特写；一侧人物背对镜头；背景是招牌/菜单（超写实真人实拍、电影质感、自然光）。无论横竖画幅，标题、纸条与商品特写都不得被裁切。",
compositionEn:
"Universal composition (one prompt works for 16:9 landscape, 3:4 portrait and 4:3 landscape — never hard-coded to a single frame): extra-large two-line title at the top with doodle decorations; below the title a torn paper note carrying the subtitle with the keyword underlined in red; center is a street stall / shop scene with a foreground close-up of the signature product; a character seen from behind on one side; background is a sign / menu (hyper-realistic live-action, cinematic, natural light). In any orientation the title, the note and the product close-up must never be cropped.",
titleLineZh: (plan) =>
`主标题（必须逐字出现在画面顶部、两行呈现）：「${plan.mainTitle}」——超大字号、双色，配涂鸦装饰；标题下方撕纸条副标题（逐字准确）：「${plan.subtitle || "副标题"}」，关键词用红色下划线标出。`,
titleLineEn: (plan) =>
`Main title (must appear across the top in two lines, exact Chinese characters): "${plan.mainTitle}" — extra-large letters in two colors with doodle decorations; subtitle on the torn paper note below (exact Chinese characters): "${plan.subtitle || "副标题"}", keyword underlined in red.`,
shortTitleLineZh: (_plan, title) =>
`主标题「${title}」置顶两行超大字号、双色配涂鸦、逐字准确；标题下方撕纸条写金句副标题，前景招牌商品特写，一侧背影。`,
shortTitleLineEn: (_plan, title) =>
`Title "${title}" (exact Chinese characters) in two extra-large lines across the top, two colors with doodles; torn paper note subtitle below, foreground signature product close-up, character seen from behind on one side.`,
propShortHintZh: "在前景以特写呈现",
propShortHintEn: "shown in close-up in the foreground",
propLabelZh: "招牌商品（前景特写、视觉锚点）",
propLabelEn: "Signature product (foreground close-up, visual anchor)",
effectsLabelZh: "涂鸦装饰（标题旁的纸飞机、爱心、星星等）",
effectsLabelEn: "Doodle decorations (paper plane, heart, sparkles beside the title)",
},
{
id: "evidence_reveal",
label: "风格11 · 证物揭晓",
shortDesc:
"中央证物超写实特写 + 表面/真相双标签 + 揭晓式大标题（反转揭晓单集）",
analysisSummary:
"中央一个超写实证物特写 + 上下两张\"表面/真相\"身份标签 + 顶部一句揭晓式大标题；人物退居两侧当证人；档案证物风，红章、编号、封条做第二层。独一性：从用户自己的三单精修解剖机制提炼（萝卜头=灵参、爸爸=校长、规则字面执行），而非学外部爆款封面。",
traits: EVIDENCE_REVEAL_TRAITS,
rulesZh: EVIDENCE_REVEAL_RULES_ZH,
rulesEn: EVIDENCE_REVEAL_RULES_EN,
negativeZh:
"不要：人物居中抢戏、证物太小、表面和真相标签同字号同色、标题写成口号而非揭晓句、无证物编号和印章等档案元素、全屏高饱和综艺色、水印、无关文字。",
negativeEn:
"Avoid: characters taking the center, tiny evidence, surface and truth labels in the same size and color, title written as a slogan instead of a reveal, missing evidence tag and stamp, full-frame high-saturation variety colors, watermarks, unrelated or garbled text.",
shortNameZh: "证物揭晓",
shortNameEn: "Evidence Reveal",
digestZh:
"证物中央特写、表面/真相双标签、揭晓式大标题、人物两侧当证人、档案红章封条",
digestEn:
"evidence close-up at center, surface/truth double labels, reveal headline, characters as witnesses on both sides, archive red stamps and seals",
paletteZh:
"暗底 + 金黄真相 + 红章 + 白表面标签",
paletteEn:
"dark background + gold truth letters + red stamps and seals + white surface label",
negativeShortZh:
"人物居中抢戏、证物太小、双标签同字号同色、标题写成口号、无档案元素、全屏高饱和综艺色、水印、乱码文字",
negativeShortEn:
"characters taking the center, tiny evidence, labels in same size and color, slogan title, missing file elements, full-frame high-saturation colors, watermarks, garbled text",
forceLayout: "slogan",
},
];

export function coverStyleById(id: string): CoverStyleDef {
return COVER_STYLES.find((s) => s.id === id)?? COVER_STYLES[0]!;
}

/** 通用构图（与画幅无关）：一份主提示词同时适用于 16:9 / 3:4 / 4:3。
 * 核心锚点不随画幅变：标题锁顶、VS徽章居中、人物左右对峙、道具居中前景。
 * 具体画幅的收放只在提交时由 ratioAdapter 追加，不写进主提示词，
 * 因此用户改比例、或一键生成三比例时，主提示词一字不用改。 */
export function ratioCompositionZh(_ratio?: string): string {
  return "通用构图（同一份提示词适用于 16:9 横版、3:4 竖版、4:3 横版，不为单一画幅写死）：主标题始终横贯画面顶部全宽（VS 徽章嵌在标题正中、也是画面视觉中心），主要人物在标题下方左右分组对峙（左阵营在左、右阵营在右，身体与视线指向对方），核心道具放大在画面中央前景，动势线斜穿画面连接左右两边，主题特效与背景填满其余所有空间；人物脸部与标题是第一、第二视觉焦点，无论横竖画幅都不得被裁切、不得被挤到角落。";
}

export function ratioCompositionEn(_ratio?: string): string {
  return "Universal composition (one prompt works for 16:9 landscape, 3:4 portrait and 4:3 landscape — never hard-coded to a single frame): the main title always spans the full top width (VS badge embedded at its center, also the visual center of the frame), main characters grouped left vs right below the title (left camp left, right camp right, bodies and gazes aimed at each other), key prop enlarged at center foreground, the dynamic arc slashing diagonally to link both camps, themed effects and background filling every remaining space; faces and the title are the first and second focal points and must never be cropped or pushed into a corner in any orientation.";
}

export type CoverRatio = "16:9" | "3:4" | "4:3";
export const ALL_COVER_RATIOS: CoverRatio[] = ["16:9", "3:4", "4:3"];

/** 提交时按目标画幅追加的适配短句（只在提交副本上加，不进主提示词）。 */
export function ratioAdapterZh(ratio: string): string {
  if (ratio === "16:9") return "【本次画幅 16:9 横版】在通用构图之上：标题单行横贯顶部，左右阵营向两侧拉开、中央道具居中下方，横向动势线贯穿全幅，人物取半身近景。";
  if (ratio === "4:3") return "【本次画幅 4:3 横版】在通用构图之上：标题占顶部约四分之一，左右阵营收紧、人物脸更大更近，中央道具居中前景，特效填满四角。";
  return "【本次画幅 3:4 竖版】在通用构图之上：标题在顶部可分两行堆叠压顶，人物在中下部左右对峙，中央道具在中央或底部前景放大，动势线纵向斜穿。";
}
export function ratioAdapterEn(ratio: string): string {
  if (ratio === "16:9") return "[This frame: 16:9 landscape] On top of the universal composition: title in one row across the top, camps spread to both sides, key prop at center-bottom, horizontal dynamic arc across the frame, characters in half-body close-up.";
  if (ratio === "4:3") return "[This frame: 4:3 landscape] On top of the universal composition: title takes the top quarter, camps tightened, faces larger and closer, key prop at center foreground, effects filling all corners.";
  return "[This frame: 3:4 portrait] On top of the universal composition: title may stack in two rows across the top, characters facing off in the middle-lower area, key prop enlarged at center or bottom foreground, dynamic arc slashing vertically-diagonal.";
}

/** 给一份主提示词（中或英）生成某个画幅的提交副本：主提示词 + 该画幅适配句。已带适配句的不重复加。 */
export function withRatioAdapter(prompt: string, ratio: string, lang: "zh" | "en"): string {
  const base = prompt.trim();
  if (!base) return base;
  if (base.includes("【本次画幅") || base.includes("[This frame:")) return base;
  const adapter = lang === "en" ? ratioAdapterEn(ratio) : ratioAdapterZh(ratio);
  return `${base}\n${adapter}`;
}

// ---------------------------------------------------------------------------
// v3.85 提交字数预算（根因修复的硬兜底）：Geeknow 的异步提交端点对
// prompt 有 4000 字符硬上限（实测 400 invalid_request「prompt is
// too long, max 4000 characters」，按字符数计、中英文都算 1 个）。
// 拼装函数的产出必须 ≤ 本台安全线 3900：规则块已压缩（见上方风格
// 1），万一方案细节仍然过长，按固定优先序在句界处压缩——配色补
// 充 → 背景 → 特效 → 人物表情动作 → 核心道具 → 多余气泡；主标题、
// 钩子句、人物名单、风格规则与负面口径永不裁。裁的只是拼进提示
// 词的副本，方案本身（plan）一字不动，用户在方案里仍能看到全文。
// 服务端提交动作与两个页面共用这两个常量做提交前校验与字数显示。
// ---------------------------------------------------------------------------

export const GEEKNOW_PROMPT_HARD_LIMIT = 4000;
export const SUBMIT_PROMPT_BUDGET = 3900;
/** 提交时追加的最长画幅适配句（中英三比例取最大，实测英文 3:4 为
 * 247 字符——v3.87 曾按「约 180」估算留余量，估算偏小：主提示词
 * 3707 + 适配句 196~248 实际拼出 3903~3955，页面计数却只数主词、
 * 显示「在安全线内」，一点生成就被本地与服务端按 3900 拦下，三
 * 比例全灭。v3.88 起余量从适配句的实际长度反推，不再靠估算。）。 */
export const MAX_RATIO_ADAPTER_LEN = Math.max(
  ...ALL_COVER_RATIOS.flatMap((r) => [
    ratioAdapterEn(r).length,
    ratioAdapterZh(r).length,
  ]),
);
/** 主提示词预算：主词 + 换行 + 最长适配句仍 ≤ SUBMIT_PROMPT_BUDGET。 */
export const MASTER_PROMPT_BUDGET =
  SUBMIT_PROMPT_BUDGET - MAX_RATIO_ADAPTER_LEN - 1;

/** 按句末标点切句（每句保留自己的收尾标点）。 */
function splitSentences(text: string): string[] {
  const parts = text.match(/[^。；！？;!?\n]+[。；！？;!?]?/g);
  return (parts ?? [text]).map((x) => x.trim()).filter(Boolean);
}

/** 只留第一句。 */
function firstSentence(text: string): string {
  const parts = splitSentences(text);
  return parts.length > 0 ? parts[0]! : text;
}

/** 在句界处把文本压到 maxLen 以内：整句装得下就整句留，第一句都
 * 装不下时在最后一个逗号类标点处断，绝不在词中间硬切。 */
function cutAtBoundary(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  let out = "";
  for (const part of splitSentences(t)) {
    if ((out + part).length > maxLen) break;
    out += part;
  }
  if (out) return out;
  const head = t.slice(0, maxLen);
  const punct = Math.max(
    head.lastIndexOf("，"),
    head.lastIndexOf("、"),
    head.lastIndexOf(","),
    head.lastIndexOf(" "),
  );
  return (punct > maxLen * 0.4 ? head.slice(0, punct + 1) : head).trim();
}

/** 拼装并强制预算：先整份拼，超了就按 trims 顺序逐级收（每级收完
 * 重拼一次）；trims 只动标题风格 / 站位这类可压缩的方案文字，风格
 * 规则与负面口径永不裁。 */
function fitWithinBudget(
  compose: () => string,
  trims: Array<() => boolean>,
): string {
  let out = compose();
  for (const trim of trims) {
    if (out.length <= MASTER_PROMPT_BUDGET) break;
    if (trim()) out = compose();
  }
  return out;
}

/** 取某位人物的站位文字（指定语言版本；英文缺译时回退中文位置）。 */
function positionOf(
  plan: CoverPlan,
  name: string,
  lang: "zh" | "en",
): string {
  const list =
    lang === "en" && plan.characterPositionsEn
      ? plan.characterPositionsEn
      : plan.characterPositions;
  const hit = list.find((x) => x.name === name);
  if (hit && hit.position.trim()) return hit.position.trim();
  if (lang === "en") {
    const zh = plan.characterPositions.find((x) => x.name === name);
    if (zh && zh.position.trim()) return zh.position.trim();
  }
  return "";
}

/** v5.09 拼词口径（用户定）：提示词只带三样分析产物——人物站位
 * （代号/称呼 + 位置 + 参考图绑定）、标题（文字 + 位置 + 风格），
 * 外加所选风格自己的构图与规则原文。人物的长相、穿搭一律以随附
 * 的人物资产图为准（人物行里的约束句写死），不写任何外貌、服装
 * 描述；钩子、气泡、道具、背景、特效、配色不再有分析文字进提示
 * 词（风格规则里自带的画面要求属风格模板本身，不在此列）。 */
export function buildCoverPromptZh(
  plan: CoverPlan,
  style: CoverStyleDef,
  ratio: string,
): string {
  const chars = plan.mainCharacters.map((m) => m.trim()).filter(Boolean);
  let titleStyle = plan.titleStyle.trim();
  let positions = chars.map((name) => positionOf(plan, name, "zh"));
  const titleText =
    plan.layoutType === "vs" && plan.sideA.trim() && plan.sideB.trim()
      ? `${plan.sideA.trim()} VS ${plan.sideB.trim()}`
      : plan.mainTitle.trim();
  const compose = (): string => {
    const lines: string[] = [];
    lines.push(style.compositionZh ?? ratioCompositionZh(ratio));
    if (chars.length > 0) {
      lines.push(
        `上封面人物：${chars
          .map(
            (name, idx) =>
              `${name}${positions[idx] ? `，${positions[idx]}` : ""}，参考图 #${idx + 1}`,
          )
          .join("；")}（外貌与服装以随附的人物资产图为准，严格参照人物资产图，同一个人同一张脸同一套衣服）。`,
      );
    }
    const titleParts: string[] = [`主标题（逐字准确）：「${titleText}」`];
    if (plan.subtitle.trim()) {
      titleParts.push(`副标题（逐字准确）：「${plan.subtitle.trim()}」`);
    }
    if (plan.titlePosition.trim()) {
      titleParts.push(`标题位置：${plan.titlePosition.trim()}`);
    }
    if (titleStyle) {
      titleParts.push(`标题风格：${titleStyle}`);
    }
    lines.push(`${titleParts.join("；")}。`);
    lines.push(style.rulesZh);
    lines.push(style.negativeZh);
    return lines.join("\n");
  };
  return fitWithinBudget(compose, [
    () => {
      const cut = firstSentence(titleStyle);
      if (cut !== titleStyle) {
        titleStyle = cut;
        return true;
      }
      return false;
    },
    () => {
      let changed = false;
      positions = positions.map((pos) => {
        const cut = firstSentence(pos);
        if (cut !== pos) changed = true;
        return cut;
      });
      return changed;
    },
    () => {
      if (titleStyle.length > 40) {
        titleStyle = cutAtBoundary(titleStyle, 40);
        return true;
      }
      return false;
    },
  ]);
}

/** 英文版与中文版一一对应（生图模型优先吃英文时用）：站位 / 标题
 * 位置 / 标题风格用服务端第二步的重译，缺译回退中文；标题文字与
 * 人物名保持中文原文逐字（画面上呈现的就是中文）。 */
export function buildCoverPromptEn(
  plan: CoverPlan,
  style: CoverStyleDef,
  ratio: string,
): string {
  const chars = plan.mainCharacters.map((m) => m.trim()).filter(Boolean);
  let titleStyle = (plan.titleStyleEn ?? "").trim() || plan.titleStyle.trim();
  let positions = chars.map((name) => positionOf(plan, name, "en"));
  const titlePosition =
    (plan.titlePositionEn ?? "").trim() || plan.titlePosition.trim();
  const titleText =
    plan.layoutType === "vs" && plan.sideA.trim() && plan.sideB.trim()
      ? `${plan.sideA.trim()} VS ${plan.sideB.trim()}`
      : plan.mainTitle.trim();
  const compose = (): string => {
    const lines: string[] = [];
    lines.push(style.compositionEn ?? ratioCompositionEn(ratio));
    if (chars.length > 0) {
      lines.push(
        `Cover characters: ${chars
          .map(
            (name, idx) =>
              `${name}${positions[idx] ? `, ${positions[idx]}` : ""}, reference image #${idx + 1}`,
          )
          .join("; ")} (faces and outfits must match the attached character asset images — strictly follow the character asset images, same person, same face, same outfit).`,
      );
    }
    const titleParts: string[] = [
      `Main title (exact Chinese characters): "${titleText}"`,
    ];
    if (plan.subtitle.trim()) {
      titleParts.push(
        `Subtitle (exact Chinese characters): "${plan.subtitle.trim()}"`,
      );
    }
    if (titlePosition) {
      titleParts.push(`Title placement: ${titlePosition}`);
    }
    if (titleStyle) {
      titleParts.push(`Title style: ${titleStyle}`);
    }
    lines.push(`${titleParts.join("; ")}.`);
    lines.push(style.rulesEn);
    lines.push(style.negativeEn);
    return lines.join("\n");
  };
  return fitWithinBudget(compose, [
    () => {
      const cut = firstSentence(titleStyle);
      if (cut !== titleStyle) {
        titleStyle = cut;
        return true;
      }
      return false;
    },
    () => {
      let changed = false;
      positions = positions.map((pos) => {
        const cut = firstSentence(pos);
        if (cut !== pos) changed = true;
        return cut;
      });
      return changed;
    },
    () => {
      if (titleStyle.length > 60) {
        titleStyle = cutAtBoundary(titleStyle, 60);
        return true;
      }
      return false;
    },
  ]);
}

// ---------------------------------------------------------------------------
// v5.09 方案完整度（原 v3.90 签名覆盖度下线）：分析只出三样——人物
// 站位、标题位置、标题风格，外加标题文字本身。完整度只对这几项做
// 确定性检查（标题有没有、每位人物有没有位置、标题位置 / 风格有
// 没有），给页面提示缺哪几项；不再有签名版与浓缩短稿，拼词只有
// 一份（中英各一），写稿与备查稿同文。
// ---------------------------------------------------------------------------

export interface SignatureCoverage {
  /** 0–1，三样（站位 / 标题位置 / 标题风格）+ 标题文字的完整比例。 */
  score: number;
  /** 没齐的项（给用户看的中文清单）。 */
  missing: string[];
}

/** 三样完整度（确定性计算，客户端与服务端同口径）：标题文字（权重
 * 2）、逐人物站位（权重 2，按有位置的人数比例）、标题位置（权重
 * 1）、标题风格（权重 1）。函数名沿用 signatureCoverage（v5.09 前
 * 是签名覆盖度），签名版已下线，口径以本注释为准。 */
export function signatureCoverage(plan: CoverPlan): SignatureCoverage {
  const missing: string[] = [];
  let got = 0;
  let total = 0;
  const item = (weight: number, value: number, label: string) => {
    total += weight;
    got += weight * value;
    if (value < 1 && label) missing.push(label);
  };
  item(
    2,
    plan.mainTitle.trim() || (plan.sideA.trim() && plan.sideB.trim())
      ? 1
      : 0,
    "主标题",
  );
  const chars = plan.mainCharacters.map((m) => m.trim()).filter(Boolean);
  if (chars.length === 0) {
    item(2, 0, "上封面人物");
  } else {
    const noPos = chars.filter(
      (name) =>
        !plan.characterPositions.find((x) => x.name === name)?.position.trim(),
    );
    total += 2;
    got += 2 * ((chars.length - noPos.length) / chars.length);
    if (noPos.length > 0) {
      missing.push(`人物站位缺：${noPos.join("、")}`);
    }
  }
  item(1, plan.titlePosition.trim() ? 1 : 0, "标题位置");
  item(1, plan.titleStyle.trim() ? 1 : 0, "标题风格");
  return { score: total > 0 ? got / total : 0, missing };
}

export interface CoverPrompts {
  /** 中文主稿（v5.09 唯一拼词：站位 + 标题 + 风格规则）。 */
  writePrompt: string;
  /** 备查稿：v5.09 起与主稿同文（字段保留，页面/记录结构不变）。 */
  detailFallback: string;
  /** 英文主稿。 */
  promptEn: string;
  /** 英文备查稿：与英文主稿同文。 */
  promptEnFallback: string;
  /** 三样完整度 0–1。 */
  coverage: number;
  /** 没齐的项（给用户看）。 */
  coverageMissing: string[];
  /** v5.09 起恒为 false（浓缩短稿已下线），字段保留兼容旧记录读取。 */
  usedCondensed: boolean;
  /** v5.09 起恒为 false（同上）。 */
  enCondensed: boolean;
}

/** v3.98 人物约束句检测（封面提交一致性检查的统一口径，客户端提交
 * 入口与任何重提路径共用）：提示词里只要出现「外貌 / 服装以随附的
 * 人物资产图为准」一类硬约束（中英任一写法），就意味着这份提示词
 * 必须真的带参考图提交——零图纯文本发出时，上游模型不会出图，只
 * 会回一段「请上传参考图」的文字，被 Geeknow 包成 400
 * upstream_text_reply 判失败（v3.89 在记录重提上实证过）。提交前
 * 用这个函数判断实际将提交的那一份提示词是否带约束，再与实际带
 * 上的参考图数量对账（v4.22 起）：有图 → 保留约束原样提交；零图
 * → 用 stripCharacterConstraint 自动去掉约束、降级纯文字提交，
 * 不再整单拦下（v3.98–v4.05 的拦截口径已被用户明确推翻）。 */
export function promptHasCharacterConstraint(text: string): boolean {
  if (!text) return false;
  return (
    // 机器拼词口径（v3.98 起）：随附…资产图为准 / attached / match the attached。
    /随附[^。；\n]{0,12}资产图为准/.test(text) ||
    text.includes("以随附的人物资产图为准") ||
    text.includes("以随附人物资产图为准") ||
    /attached (character )?asset images/i.test(text) ||
    /match the attached/i.test(text) ||
    // v5.23 草稿口径（聊天草稿 / 手粘稿的同义表述，记录 id 43 实证：
    // 草稿约束句「严格参照人物资产图」/「must strictly match the
    // character asset images」中英文均无「随附」/「attached」，旧词
    // 表两版都测不出 false，确认弹窗与降级双双没触发、0 图硬提）。
    /[^。；\n]{0,6}资产图为准/.test(text) ||
    /严格参照[^。；\n]{0,10}资产图/.test(text) ||
    /参照[^。；\n]{0,10}人物资产图/.test(text) ||
    /(?:strictly\s+)?match(?:es)?\s+the\s+(?:character\s+)?asset\s+images/i.test(text) ||
    // 行内「参考图 #N」绑定本身就声称有参考图随行（id 43 存词里
    // 残留的悬空编号），同样算「需要参考图」。
    /参考图\s*#\s*\d/.test(text) ||
    /reference\s+images?\s*#\s*\d/i.test(text)
  );
}

/** v5.23 悬空参考图引用清理：零图降级时，提示词里指向不存在图片
 * 的「参考图 #N」引用一并清掉——独立成行的绑定行由 sync 摘除，但
 * 草稿里行末 / 行内的后缀（如人物条目尾巴上的「参考图 #1～#5」、
 * 「（参考图 #2）」）摘不掉，留着模型会以为真有第 N 张图。只在降
 * 级路径调用（有图提交时绑定合法、原样保留）。 */
export function stripDanglingRefMentions(text: string): string {
  if (!text) return text;
  let out = text;
  // 括号形态先整段摘（括号里可能还带别名等其他字，一并去掉）。
  out = out.replace(/（[^）]*参考图\s*#\s*\d[^）]*）/g, "");
  out = out.replace(/\([^)]*reference\s+images?\s*#\s*\d[^)]*\)/gi, "");
  // 裸引用（含 #1～#5 / #1、#2 这类连排编号）摘掉，前导分隔符
  // 一并带走，避免留下「人物：。」这类残痕。
  out = out.replace(
    /[，,、；;：:]?\s*参考图\s*#\s*\d+(?:\s*[、,，~～\-—]\s*#?\s*\d+)*/g,
    "",
  );
  out = out.replace(
    /,?\s*reference\s+images?\s*#\s*\d+(?:\s*[,~～\-—]\s*#?\s*\d+)*/gi,
    "",
  );
  out = out.replace(/（\s*）|\(\s*\)/g, "");
  out = out.replace(/\s+([,;:，。；：.!?])/g, "$1");
  out = out.replace(/[ \t]{2,}/g, " ");
  out = out.replace(/。{2,}/g, "。");
  out = out
    .split("\n")
    .filter((line) => !/^[\s。．.,;:：；、!?！？]*$/.test(line))
    .join("\n");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** v4.22 约束句自动去除（与 promptHasCharacterConstraint 同口径）：
 * 没有参考图随行时（用户没勾公开图床同意 / 没选参考图 / 名单人物
 * 无图），提交副本必须把「外貌与服装以随附的人物资产图为准」一类
 * 约束自动去掉再按纯文字提交——零图带约束硬提注定被上游以 400
 * upstream_text_reply 拒（v3.89 实证），而整单拦下又违背用户「必
 * 须能生成」的要求，所以 v4.22 起改自动降级：只动提交副本，页面
 * 上的提示词原文不动。拼词产出的约束句都是括号形态（中英同），
 * 先整段摘掉含约束的括号，再兜底摘不在括号里的裸子句，最后清理
 * 摘除留下的标点 / 空格残痕；摘完用 promptHasCharacterConstraint
 * 复检，仍有残留时按行摘除含约束标记的整行，保证返回文本不再
 * 触发约束检测。 */
export function stripCharacterConstraint(text: string): string {
  if (!text || !promptHasCharacterConstraint(text)) return text;
  let out = text;
  // 括号形态（拼词固定段全是这种）：整段摘掉。v5.23 同步扩到草稿
  // 措辞：括号里带「参照…资产图」/「资产图为准」/「match … asset
  // images」的同样整段摘。
  out = out.replace(/（[^）]*随附[^）]*）/g, "");
  out = out.replace(/\([^)]*attached[^)]*\)/gi, "");
  out = out.replace(/\([^)]*随附[^)]*\)/g, "");
  out = out.replace(/（[^）]*(?:参照[^）]*资产图|资产图为准)[^）]*）/g, "");
  out = out.replace(
    /\([^)]*(?:strictly\s+)?match(?:es)?\s+the\s+(?:character\s+)?asset\s+images[^)]*\)/gi,
    "",
  );
  // 裸子句兜底（手写提示词可能不带括号）：摘到最近的句读为止。
  out = out.replace(/[^。；！？\n]*随附[^。；！？\n]*/g, "");
  out = out.replace(/[^.;!?\n]*match the attached[^.;!?\n]*/gi, "");
  // v5.23 草稿措辞裸子句：严格参照…资产图 / …资产图为准 /
  // (strictly) match the (character) asset images，同口径摘除。
  out = out.replace(
    /[^。；！？\n]*(?:严格参照|参照)[^。；！？\n]*资产图[^。；！？\n]*/g,
    "",
  );
  out = out.replace(/[^。；！？\n]*资产图为准[^。；！？\n]*/g, "");
  out = out.replace(
    /[^.;!?\n]*(?:strictly\s+)?match(?:es)?\s+the\s+(?:character\s+)?asset\s+images[^.;!?\n]*/gi,
    "",
  );
  // 清理残痕：空括号、标点前空格、重复空格、连排句号、纯标点残行。
  out = out.replace(/（\s*）|\(\s*\)/g, "");
  out = out.replace(/\s+([,;:，。；：.!?])/g, "$1");
  out = out.replace(/[ \t]{2,}/g, " ");
  out = out.replace(/。{2,}/g, "。");
  out = out
    .split("\n")
    .filter((line) => !/^[\s。．.,;:：；、!?！？]*$/.test(line))
    .join("\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  // v5.23 ②：悬空「参考图 #N」引用一并清除（行末后缀形态）。
  out = stripDanglingRefMentions(out);
  if (promptHasCharacterConstraint(out)) {
    // 仍有残留（少见的跨行写法）：按行摘除含约束标记的行。
    out = out
      .split("\n")
      .filter(
        (line) =>
          !/随附|资产图为准|参照[^。；\n]{0,10}资产图|attached|match the attached|(?:strictly\s+)?match(?:es)?\s+the\s+(?:character\s+)?asset\s+images|参考图\s*#|reference\s+images?\s*#/i.test(line),
      )
      .join("\n");
    out = stripDanglingRefMentions(out);
  }
  return out.trim();
}

/** v5.16 风格 11（evidence_reveal）人物行强化句：与 EVIDENCE_REVEAL_
 * RULES_ZH / RULES_EN 里的【人物站位】行同一句（v5.15 已进规则）。
 * 问题在手粘路径：用户把聊天框出的提示词粘进第三步时，粘的那一版
 * 可能丢了这句（项目 39 记录 id 39 / 40 实证：真正提交的语言版本
 * 缺强化句），拼词规则管不到手粘稿。所以提交时再兜底一次：风格
 * 是 evidence_reveal 且提交副本里没有这句时，由提交入口调用
 * ensureEvidenceReinforcement 补上；已有（草稿里带了）就不重复
 * 加——检测按关键片段组合判定，不要求逐字相等，草稿里「随附的
 * 2 张人物资产图，A 和 E 必须同时出现在画面上」这类同义写法也算
 * 已有。只对风格 11 生效，风格 1–10 的提示词一字不动。 */
export const EVIDENCE_REVEAL_REINFORCE_ZH =
  "【人物站位】本封面必须使用随附的人物资产图，人物必须同时出现在画面上，分列证物两侧，缺一不可；面部特征与整体造型严格以人物资产图为准、绝不更改，绝不凭空画人、绝不换脸；穿搭默认以资产图为准，场景需要时可以调整。";
export const EVIDENCE_REVEAL_REINFORCE_EN =
  "【Character positions】This cover must use the attached character asset images. The characters must all appear in the frame, standing on either side of the evidence — none may be missing. Faces and overall styling must strictly match the character asset images, never change; never invent a person, never swap faces; outfits follow the asset images by default, adjustable if the scene needs.";

export function promptHasEvidenceReinforcement(
  text: string,
  lang: "zh" | "en",
): boolean {
  if (!text) return false;
  if (lang === "zh") {
    return (
      text.includes("必须使用随附") &&
      (text.includes("缺一不可") || text.includes("必须同时出现")) &&
      text.includes("凭空画人")
    );
  }
  const t = text.toLowerCase();
  return (
    /must use the (?:\d+ )?attached character asset images/.test(t) &&
    (t.includes("may be missing") ||
      t.includes("must all appear") ||
      t.includes("must both appear")) &&
    t.includes("never invent a person")
  );
}

/** 已有强化句 → 原样返回（不叠加）；没有 → 末尾补一行。空文本不补
 * （那一版语言框本来就是空的，补了反而会让「英文优先」的提交口径
 * 把单独一行英文强化句当成整份提示词提交）。 */
export function ensureEvidenceReinforcement(
  text: string,
  lang: "zh" | "en",
): string {
  if (!text.trim()) return text;
  if (promptHasEvidenceReinforcement(text, lang)) return text;
  const line =
    lang === "zh" ? EVIDENCE_REVEAL_REINFORCE_ZH : EVIDENCE_REVEAL_REINFORCE_EN;
  return `${text.replace(/\s+$/, "")}\n${line}`;
}

/** 统一拼词入口（v5.09）：中英各拼一份（三样 + 风格规则），写稿
 * 与备查同文；完整度只作页面提示，不再决定拼哪一稿。 */
export function buildCoverPrompts(
  plan: CoverPlan,
  style: CoverStyleDef,
  ratio: string,
): CoverPrompts {
  const zh = buildCoverPromptZh(plan, style, ratio);
  const en = buildCoverPromptEn(plan, style, ratio);
  const cov = signatureCoverage(plan);
  return {
    writePrompt: zh,
    detailFallback: zh,
    promptEn: en,
    promptEnFallback: en,
    coverage: cov.score,
    coverageMissing: cov.missing,
    usedCondensed: false,
    enCondensed: false,
  };
}
