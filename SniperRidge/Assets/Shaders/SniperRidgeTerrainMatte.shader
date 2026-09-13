// 광택 없는 지형 셰이더 (내장 렌더 파이프라인).
// Unity 의 Nature/Terrain/Standard 와 같은 스플랫 혼합, 색 보정(diffuseRemap), 노멀맵, 안개,
// 그림자, 인스턴싱을 쓰되 조명은 램버트 확산 + 환경광만 계산한다.
// 반사광(스페큘러)과 하늘 반사가 전혀 없어 낮은 태양 아래에서도 모래·흙이 반짝이지 않는다.
Shader "SniperRidge/TerrainMatte"
{
    Properties
    {
        [HideInInspector] _Control ("Control (RGBA)", 2D) = "red" {}
        [HideInInspector] _Splat3 ("Layer 3 (A)", 2D) = "grey" {}
        [HideInInspector] _Splat2 ("Layer 2 (B)", 2D) = "grey" {}
        [HideInInspector] _Splat1 ("Layer 1 (G)", 2D) = "grey" {}
        [HideInInspector] _Splat0 ("Layer 0 (R)", 2D) = "grey" {}
        [HideInInspector] _Normal3 ("Normal 3 (A)", 2D) = "bump" {}
        [HideInInspector] _Normal2 ("Normal 2 (B)", 2D) = "bump" {}
        [HideInInspector] _Normal1 ("Normal 1 (G)", 2D) = "bump" {}
        [HideInInspector] _Normal0 ("Normal 0 (R)", 2D) = "bump" {}
        [HideInInspector] _Mask3 ("Mask 3 (A)", 2D) = "grey" {}
        [HideInInspector] _Mask2 ("Mask 2 (B)", 2D) = "grey" {}
        [HideInInspector] _Mask1 ("Mask 1 (G)", 2D) = "grey" {}
        [HideInInspector] _Mask0 ("Mask 0 (R)", 2D) = "grey" {}
        [HideInInspector][Gamma] _Metallic0 ("Metallic 0", Range(0.0, 1.0)) = 0.0
        [HideInInspector][Gamma] _Metallic1 ("Metallic 1", Range(0.0, 1.0)) = 0.0
        [HideInInspector][Gamma] _Metallic2 ("Metallic 2", Range(0.0, 1.0)) = 0.0
        [HideInInspector][Gamma] _Metallic3 ("Metallic 3", Range(0.0, 1.0)) = 0.0
        [HideInInspector] _Smoothness0 ("Smoothness 0", Range(0.0, 1.0)) = 0.0
        [HideInInspector] _Smoothness1 ("Smoothness 1", Range(0.0, 1.0)) = 0.0
        [HideInInspector] _Smoothness2 ("Smoothness 2", Range(0.0, 1.0)) = 0.0
        [HideInInspector] _Smoothness3 ("Smoothness 3", Range(0.0, 1.0)) = 0.0

        // 구형 카드 폴백과 베이스맵용
        [HideInInspector] _MainTex ("BaseMap (RGB)", 2D) = "white" {}
        [HideInInspector] _Color ("Main Color", Color) = (1,1,1,1)
        [HideInInspector] _TerrainHolesTexture ("Holes Map (RGB)", 2D) = "white" {}
    }

    SubShader
    {
        Tags { "Queue" = "Geometry-100" "RenderType" = "Opaque" "TerrainCompatible" = "True" }

        CGPROGRAM
        #pragma surface surf MatteTerrain vertex:SplatmapVert finalcolor:SplatmapFinalColor addshadow fullforwardshadows exclude_path:deferred exclude_path:prepass
        #pragma instancing_options assumeuniformscaling nomatrices nolightprobe nolightmap forwardadd
        #pragma multi_compile_fog
        #pragma target 3.0
        #include "UnityPBSLighting.cginc"

        #pragma multi_compile_local_fragment __ _ALPHATEST_ON
        #pragma multi_compile_local __ _NORMALMAP

        // 램버트 확산 + 환경광만 쓰는 출력 구조체. 반사광 항목이 없다.
        struct SurfaceOutputMatte
        {
            fixed3 Albedo;
            fixed3 Normal;
            fixed3 Emission;
            half Occlusion;
            half Alpha;
        };

        #define TERRAIN_STANDARD_SHADER
        #define TERRAIN_INSTANCED_PERPIXEL_NORMAL
        #define TERRAIN_SURFACE_OUTPUT SurfaceOutputMatte
        #include "TerrainSplatmapCommon.cginc"

        half _Metallic0, _Metallic1, _Metallic2, _Metallic3;
        half _Smoothness0, _Smoothness1, _Smoothness2, _Smoothness3;

        inline half4 LightingMatteTerrain(SurfaceOutputMatte s, half3 viewDir, UnityGI gi)
        {
            half ndotl = saturate(dot(s.Normal, gi.light.dir));
            half4 c;
            c.rgb = s.Albedo * gi.light.color * ndotl + s.Albedo * gi.indirect.diffuse;
            c.a = s.Alpha;
            return c;
        }

        inline void LightingMatteTerrain_GI(SurfaceOutputMatte s, UnityGIInput data, inout UnityGI gi)
        {
            // 반사 프로브를 쓰지 않는 3인자 버전: 직접광 + 환경광(확산)만.
            gi = UnityGlobalIllumination(data, s.Occlusion, s.Normal);
        }

        void surf(Input IN, inout SurfaceOutputMatte o)
        {
            half4 splat_control;
            half weight;
            fixed4 mixedDiffuse;
            half4 defaultSmoothness = half4(_Smoothness0, _Smoothness1, _Smoothness2, _Smoothness3);
            SplatmapMix(IN, defaultSmoothness, splat_control, weight, mixedDiffuse, o.Normal);
            o.Albedo = mixedDiffuse.rgb;
            o.Alpha = weight;
            o.Occlusion = 1;
            o.Emission = 0;
        }
        ENDCG

        UsePass "Hidden/Nature/Terrain/Utilities/PICKING"
        UsePass "Hidden/Nature/Terrain/Utilities/SELECTION"
    }

    Dependency "AddPassShader"    = "Hidden/TerrainEngine/Splatmap/Standard-AddPass"
    Dependency "BaseMapShader"    = "Hidden/TerrainEngine/Splatmap/Standard-Base"
    Dependency "BaseMapGenShader" = "Hidden/TerrainEngine/Splatmap/Standard-BaseGen"

    Fallback "Nature/Terrain/Diffuse"
}
