"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueName = exports.JobStatus = exports.PromptType = exports.UploadStatus = exports.Platform = exports.VideoStatus = exports.SubtitleFormat = exports.SubtitleStatus = exports.AudioStatus = exports.ImageStatus = exports.EpisodeStatus = exports.ImageStyle = exports.StoryGenre = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["ADMIN"] = "ADMIN";
    UserRole["USER"] = "USER";
    UserRole["VIEWER"] = "VIEWER";
})(UserRole || (exports.UserRole = UserRole = {}));
var StoryGenre;
(function (StoryGenre) {
    StoryGenre["ACTION"] = "ACTION";
    StoryGenre["ADVENTURE"] = "ADVENTURE";
    StoryGenre["ROMANCE"] = "ROMANCE";
    StoryGenre["HORROR"] = "HORROR";
    StoryGenre["MYSTERY"] = "MYSTERY";
    StoryGenre["FANTASY"] = "FANTASY";
    StoryGenre["SCI_FI"] = "SCI_FI";
    StoryGenre["DRAMA"] = "DRAMA";
    StoryGenre["COMEDY"] = "COMEDY";
    StoryGenre["THRILLER"] = "THRILLER";
})(StoryGenre || (exports.StoryGenre = StoryGenre = {}));
var ImageStyle;
(function (ImageStyle) {
    ImageStyle["ANIME"] = "ANIME";
    ImageStyle["CARTOON"] = "CARTOON";
    ImageStyle["CINEMATIC"] = "CINEMATIC";
    ImageStyle["REALISTIC"] = "REALISTIC";
})(ImageStyle || (exports.ImageStyle = ImageStyle = {}));
var EpisodeStatus;
(function (EpisodeStatus) {
    EpisodeStatus["PENDING"] = "PENDING";
    EpisodeStatus["GENERATING_STORY"] = "GENERATING_STORY";
    EpisodeStatus["GENERATING_SCENES"] = "GENERATING_SCENES";
    EpisodeStatus["GENERATING_PROMPTS"] = "GENERATING_PROMPTS";
    EpisodeStatus["GENERATING_IMAGES"] = "GENERATING_IMAGES";
    EpisodeStatus["GENERATING_AUDIO"] = "GENERATING_AUDIO";
    EpisodeStatus["GENERATING_SUBTITLES"] = "GENERATING_SUBTITLES";
    EpisodeStatus["COMPOSING_VIDEO"] = "COMPOSING_VIDEO";
    EpisodeStatus["GENERATING_SEO"] = "GENERATING_SEO";
    EpisodeStatus["UPLOADING"] = "UPLOADING";
    EpisodeStatus["PUBLISHED"] = "PUBLISHED";
    EpisodeStatus["FAILED"] = "FAILED";
})(EpisodeStatus || (exports.EpisodeStatus = EpisodeStatus = {}));
var ImageStatus;
(function (ImageStatus) {
    ImageStatus["PENDING"] = "PENDING";
    ImageStatus["GENERATING"] = "GENERATING";
    ImageStatus["COMPLETED"] = "COMPLETED";
    ImageStatus["FAILED"] = "FAILED";
})(ImageStatus || (exports.ImageStatus = ImageStatus = {}));
var AudioStatus;
(function (AudioStatus) {
    AudioStatus["PENDING"] = "PENDING";
    AudioStatus["GENERATING"] = "GENERATING";
    AudioStatus["COMPLETED"] = "COMPLETED";
    AudioStatus["FAILED"] = "FAILED";
})(AudioStatus || (exports.AudioStatus = AudioStatus = {}));
var SubtitleStatus;
(function (SubtitleStatus) {
    SubtitleStatus["PENDING"] = "PENDING";
    SubtitleStatus["GENERATING"] = "GENERATING";
    SubtitleStatus["COMPLETED"] = "COMPLETED";
    SubtitleStatus["FAILED"] = "FAILED";
})(SubtitleStatus || (exports.SubtitleStatus = SubtitleStatus = {}));
var SubtitleFormat;
(function (SubtitleFormat) {
    SubtitleFormat["SRT"] = "SRT";
    SubtitleFormat["VTT"] = "VTT";
    SubtitleFormat["ASS"] = "ASS";
})(SubtitleFormat || (exports.SubtitleFormat = SubtitleFormat = {}));
var VideoStatus;
(function (VideoStatus) {
    VideoStatus["PENDING"] = "PENDING";
    VideoStatus["COMPOSING"] = "COMPOSING";
    VideoStatus["COMPLETED"] = "COMPLETED";
    VideoStatus["FAILED"] = "FAILED";
})(VideoStatus || (exports.VideoStatus = VideoStatus = {}));
var Platform;
(function (Platform) {
    Platform["YOUTUBE"] = "YOUTUBE";
    Platform["INSTAGRAM"] = "INSTAGRAM";
    Platform["TIKTOK"] = "TIKTOK";
    Platform["FACEBOOK"] = "FACEBOOK";
})(Platform || (exports.Platform = Platform = {}));
var UploadStatus;
(function (UploadStatus) {
    UploadStatus["PENDING"] = "PENDING";
    UploadStatus["UPLOADING"] = "UPLOADING";
    UploadStatus["PUBLISHED"] = "PUBLISHED";
    UploadStatus["FAILED"] = "FAILED";
    UploadStatus["SCHEDULED"] = "SCHEDULED";
})(UploadStatus || (exports.UploadStatus = UploadStatus = {}));
var PromptType;
(function (PromptType) {
    PromptType["SCENE"] = "SCENE";
    PromptType["CHARACTER"] = "CHARACTER";
    PromptType["THUMBNAIL"] = "THUMBNAIL";
})(PromptType || (exports.PromptType = PromptType = {}));
var JobStatus;
(function (JobStatus) {
    JobStatus["PENDING"] = "PENDING";
    JobStatus["ACTIVE"] = "ACTIVE";
    JobStatus["COMPLETED"] = "COMPLETED";
    JobStatus["FAILED"] = "FAILED";
    JobStatus["DELAYED"] = "DELAYED";
    JobStatus["PAUSED"] = "PAUSED";
})(JobStatus || (exports.JobStatus = JobStatus = {}));
var QueueName;
(function (QueueName) {
    QueueName["EPISODE_PIPELINE"] = "episode:pipeline";
    QueueName["STORY_GENERATION"] = "story:generation";
    QueueName["SCENE_GENERATION"] = "scene:generation";
    QueueName["PROMPT_GENERATION"] = "prompt:generation";
    QueueName["IMAGE_GENERATION"] = "image:generation";
    QueueName["NARRATION_GENERATION"] = "narration:generation";
    QueueName["SUBTITLE_GENERATION"] = "subtitle:generation";
    QueueName["VIDEO_COMPOSITION"] = "video:composition";
    QueueName["SEO_GENERATION"] = "seo:generation";
    QueueName["UPLOAD"] = "upload";
    QueueName["ANALYTICS"] = "analytics";
})(QueueName || (exports.QueueName = QueueName = {}));
//# sourceMappingURL=enums.js.map