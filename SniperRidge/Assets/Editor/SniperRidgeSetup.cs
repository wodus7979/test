using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace SniperRidge.EditorTools
{
    /// <summary>
    /// 프로젝트를 처음 열었을 때 게임 씬을 만들고 빌드 설정/안드로이드 플레이어 설정을 자동으로 잡아 준다.
    /// 메뉴: Sniper Ridge > ...
    /// </summary>
    [InitializeOnLoad]
    public static class SniperRidgeSetup
    {
        const string ScenePath = "Assets/Scenes/SniperRidge.unity";
        const string ProductName = "Sniper Ridge";

        static SniperRidgeSetup()
        {
            EditorApplication.delayCall += AutoSetup;
        }

        static void AutoSetup()
        {
            if(EditorApplication.isPlayingOrWillChangePlaymode)return;
            if(EditorApplication.isCompiling || EditorApplication.isUpdating){EditorApplication.delayCall+=AutoSetup;return;}
            EnsureScene(false);
            EnsurePlayerSettings();
            EnsureAlwaysIncludedShaders();
            EnsureLinearColorSpace();
            AutoSetupEnemyModel();
            AutoBuildFirearms();
        }

        /// <summary>Firearm Asset Pack 프리팹이 없으면 생성한다.</summary>
        static void AutoBuildFirearms()
        {
            try { OriginalFirearmAssets.FirearmPackBuilder.BuildIfMissing(); }
            catch (System.Exception ex) { Debug.LogWarning("[Sniper Ridge] 총기 프리팹 자동 생성 실패: " + ex.Message); }
        }

        /// <summary>PBR 재질과 HDR 후처리가 제대로 보이도록 선형 색공간을 사용한다.</summary>
        static void EnsureLinearColorSpace()
        {
            try
            {
                if (PlayerSettings.colorSpace != ColorSpace.Linear)
                {
                    PlayerSettings.colorSpace = ColorSpace.Linear;
                    Debug.Log("[Sniper Ridge] 색공간을 Linear 로 변경했습니다.");
                }
            }
            catch (System.Exception ex)
            {
                Debug.LogWarning("[Sniper Ridge] 색공간 설정 실패: " + ex.Message);
            }
        }

        /// <summary>Assets/EnemyModel 에 FBX 가 있고 프리팹이 아직 없으면 자동으로 만든다.</summary>
        static void AutoSetupEnemyModel()
        {
            try { EnemyAnimationSetup.BuildIfNeeded(); }
            catch (System.Exception ex) { Debug.LogError("[Sniper Ridge] 적 모델 자동 설정 실패: " + ex.Message); }
        }

        [MenuItem("Sniper Ridge/게임 씬 열기")]
        public static void OpenGameScene()
        {
            EnsureScene(true);
        }

        [MenuItem("Sniper Ridge/Android APK 빌드")]
        public static void BuildAndroid()
        {
            EnsureScene(false);
            EnsurePlayerSettings();
            EnsureAlwaysIncludedShaders();
            Directory.CreateDirectory("Builds");
            EditorUserBuildSettings.buildAppBundle = false;
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = "Builds/SniperRidge.apk",
                target = BuildTarget.Android,
                options = BuildOptions.None,
            };
            Report(BuildPipeline.BuildPlayer(options), "Builds/SniperRidge.apk");
        }

        [MenuItem("Sniper Ridge/Windows 빌드")]
        public static void BuildWindows()
        {
            EnsureScene(false);
            EnsurePlayerSettings();
            EnsureAlwaysIncludedShaders();
            Directory.CreateDirectory("Builds/Windows");
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = "Builds/Windows/SniperRidge.exe",
                target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.None,
            };
            Report(BuildPipeline.BuildPlayer(options), "Builds/Windows/SniperRidge.exe");
        }

        // ---------- 적 모델 자동 설정 ----------


        /// <summary>
        /// Assets/EnemyModel 폴더에 넣어 둔 FBX(모델 1개 + 애니메이션 FBX들)로
        /// Animator Controller 와 프리팹을 만들어 Resources/Enemies/SoldierModel 로 저장한다.
        /// Idle / Walk / Run 클립을 Blend Tree에 연결하고 절차적 자세 드라이버를 생성한다.
        /// </summary>
        [MenuItem("Sniper Ridge/적 모델 자동 설정 (Assets/EnemyModel)")]
        public static void SetupEnemyModelMenu() => SetupEnemyModel(true);

        public static void SetupEnemyModel(bool interactive)
        {
            EnemyAnimationSetup.Build();
        }

        static void Report(BuildReport report, string path)
        {
            if (report.summary.result == BuildResult.Succeeded)
                Debug.Log("[Sniper Ridge] 빌드 성공: " + path);
            else
                Debug.LogError("[Sniper Ridge] 빌드 실패: " + report.summary.result);
        }

        static void EnsureScene(bool forceOpen)
        {
            bool created = false;
            if (!File.Exists(ScenePath))
            {
                var active = SceneManager.GetActiveScene();
                if (active.isDirty && !forceOpen) return;

                Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
                var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                EditorSceneManager.SaveScene(scene, ScenePath);
                AssetDatabase.Refresh();
                created = true;
                Debug.Log("[Sniper Ridge] 게임 씬을 생성했습니다: " + ScenePath + "  (Play 버튼을 누르면 레벨이 자동 생성됩니다)");
            }

            if (!EditorBuildSettings.scenes.Any(s => s.path == ScenePath))
                EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };

            var current = SceneManager.GetActiveScene();
            bool untitled = string.IsNullOrEmpty(current.path);
            if (current.path == ScenePath) return;
            if (forceOpen || created || (untitled && !current.isDirty))
                EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        }

        static void EnsurePlayerSettings()
        {
            if (PlayerSettings.productName == ProductName) return;
            try
            {
                PlayerSettings.companyName = "SniperRidge";
                PlayerSettings.productName = ProductName;
                PlayerSettings.defaultInterfaceOrientation = UIOrientation.LandscapeLeft;
                PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "com.sniperridge.game");
                PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel24;
                PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
                PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
                AssetDatabase.SaveAssets();
                Debug.Log("[Sniper Ridge] 안드로이드 플레이어 설정을 적용했습니다 (가로 모드, IL2CPP, ARM64, API 24+).");
            }
            catch (System.Exception ex)
            {
                Debug.LogWarning("[Sniper Ridge] 플레이어 설정 적용 중 문제: " + ex.Message);
            }
        }

        /// <summary>
        /// 런타임에 코드로 만드는 머티리얼/지형이 빌드에서 분홍색이 되지 않도록
        /// 필요한 셰이더를 Graphics Settings 의 Always Included Shaders 에 등록한다.
        /// </summary>
        static void EnsureAlwaysIncludedShaders()
        {
            string[] names =
            {
                "Standard", "Unlit/Color", "Sprites/Default", "UI/Default",
                "Nature/Terrain/Standard", "Nature/Terrain/Diffuse", "Legacy Shaders/Diffuse",
                "Hidden/TerrainEngine/Details/BillboardWavingDoublePass",
                "Hidden/TerrainEngine/Details/WavingDoublePass",
                "Skybox/Panoramic", "Hidden/SniperRidge/Post", "SniperRidge/Foliage",
            };
            try
            {
                var settings = new SerializedObject(UnityEngine.Rendering.GraphicsSettings.GetGraphicsSettings());
                var list = settings.FindProperty("m_AlwaysIncludedShaders");
                if (list == null) return;
                bool changed = false;
                foreach (var name in names)
                {
                    var shader = Shader.Find(name);
                    if (shader == null) continue;
                    bool exists = false;
                    for (int i = 0; i < list.arraySize; i++)
                    {
                        if (list.GetArrayElementAtIndex(i).objectReferenceValue == shader) { exists = true; break; }
                    }
                    if (exists) continue;
                    list.arraySize++;
                    list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = shader;
                    changed = true;
                }
                if (changed)
                {
                    settings.ApplyModifiedProperties();
                    AssetDatabase.SaveAssets();
                }
            }
            catch (System.Exception ex)
            {
                Debug.LogWarning("[Sniper Ridge] Always Included Shaders 설정 중 문제: " + ex.Message);
            }
        }
    }
}
