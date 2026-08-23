/**
 * Shared types for Game Optimization Hub.
 *
 * Everything is derived from the Zod schemas in `@goh/validation` — the single
 * source of truth for the API contract. Client apps (desktop + admin) import
 * these types instead of hand-writing DTOs.
 */
export type {
  AdminLoginInput,
  AdminMe,
  AuthResponse,
  DeviceRegisterInput,
  DeviceRegisterResponse,
  ViewEventInput,
  AdminCreateInput,
  AdminUpdateInput,
  RegisterInput,
  UserLoginInput,
  UserPublic,
  UserAuthResponse,
  OtpSendInput,
  OtpSendResponse,
  PasswordForgotInput,
  PasswordResetInput,
  PasswordResetResponse,
  UserUpdateInput,
  AdminUserUpdateInput,
  FavoriteParams,
  FavoriteMutationResponse,
} from '@goh/validation';

export type {
  SubscriptionPlanPublic,
  SubscriptionPlanInput,
  SubscriptionPlanUpdateInput,
  PurchaseInput,
  PurchaseResponse,
  EntitlementPublic,
  MySubscription,
  DeviceInput,
  DevicePublic,
  ManualSubscriptionInput,
  AdminSubscriptionPatch,
} from '@goh/validation';

export type {
  PaymentCallbackInput,
  PaymentPublic,
  PaymentVerifyResponse,
} from '@goh/validation';

export type {
  PackageGpuVendor,
  PackageArch,
  FileOperation,
  OptimizationPackageInput,
  OptimizationPackageUpdateInput,
  PackagePublishInput,
  PackagePresignInput,
  PackageFileCompleteInput,
  PackagePublic,
  PackageFilePublic,
  PackageFileRole,
  PackageComponent,
  PackageChoice,
  PackageDownloadResponse,
  MfgTool,
  MfgToolPackageResponse,
  MfgToolStatusResponse,
  PackageListResponse,
} from '@goh/validation';

export type {
  HardwareProfileInput,
  HardwareProfilePublic,
  HardwareRecommendInput,
  HardwareRecommendResponse,
} from '@goh/validation';

export type {
  GameSummary,
  GameDetail,
  GameListResponse,
  GameListMeta,
  GamesQuery,
  GameImage,
  GameRequirement,
  GameRequirementsInput,
  GameCreateInput,
  GameUpdateInput,
  GameImageInput,
  PresignUploadInput,
  PresignUploadResponse,
  Technologies,
  TechnologiesInput,
  DefaultProfileRef,
  CategoryRef,
} from '@goh/validation';

export type {
  OptimizationProfile,
  OptimizationProfileSummary,
  OptimizationSetting,
  OptimizationOption,
  ProfileListResponse,
  ProfileCreateInput,
  ProfileUpdateInput,
  SettingCreateInput,
  SettingUpdateInput,
  OptionCreateInput,
  OptionUpdateInput,
  VersionCreateInput,
  PublishInput,
  ProfileVersion,
} from '@goh/validation';

export type {
  Category,
  CategoryListResponse,
  CategoryCreateInput,
  CategoryUpdateInput,
  Tag,
  TagListResponse,
  TagCreateInput,
  TagUpdateInput,
  OptimizationCategory,
  OptimizationCategoryListResponse,
  OptimizationCategoryCreateInput,
  OptimizationCategoryUpdateInput,
  SyncQuery,
  SyncResponse,
} from '@goh/validation';

export type {
  AppVersion,
  AppVersionCheckQuery,
  AppVersionCheckResponse,
  AppVersionCreateInput,
  AppVersionUpdateInput,
  AppSettings,
  HomeResponse,
} from '@goh/validation';

export type {
  AdminGameRow,
  AdminGameListResponse,
  DashboardResponse,
  DashboardStats,
  TopGameRow,
  DailyViewsRow,
  AuditLogRow,
  AuditLogListResponse,
} from '@goh/validation';

export type {
  GameStatus,
  HardwareTier,
  ImageType,
  RequirementTier,
  SettingType,
  ProfileStatus,
  AdminRole,
  AppChannel,
  TechFlag,
} from '@goh/validation';

export type { ApiErrorEnvelope, PaginationMeta } from '@goh/validation';
