Shader "SniperRidge/FPS Skin"
{
    Properties
    {
        _MainTex ("Skin base color", 2D) = "white" {}
        _BumpMap ("Muscle and pore normal", 2D) = "bump" {}
        _BumpScale ("Normal strength", Range(0,2)) = 0.85
        _SurfaceMap ("G: occlusion B: thickness A: smoothness", 2D) = "white" {}
        _ScatterColor ("Subsurface tint", Color) = (0.65,0.24,0.12,1)
        _ScatterStrength ("Subsurface strength", Range(0,0.4)) = 0.13
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 300
        CGPROGRAM
        #pragma surface surf Skin fullforwardshadows addshadow exclude_path:deferred
        #pragma target 3.0
        #include "UnityPBSLighting.cginc"
        #include "UnityStandardUtils.cginc"
        sampler2D _MainTex, _BumpMap, _SurfaceMap;
        half _BumpScale, _ScatterStrength;
        half4 _ScatterColor;
        struct Input { float2 uv_MainTex; };
        struct SurfaceOutputSkin
        {
            fixed3 Albedo;
            float3 Normal;
            half3 Emission;
            half3 Specular;
            half Smoothness;
            half Occlusion;
            fixed Alpha;
            half Thickness;
        };
        SurfaceOutputStandardSpecular StandardSkin(SurfaceOutputSkin s)
        {
            SurfaceOutputStandardSpecular o;
            o.Albedo=s.Albedo; o.Normal=s.Normal; o.Emission=s.Emission;
            o.Specular=s.Specular; o.Smoothness=s.Smoothness;
            o.Occlusion=s.Occlusion; o.Alpha=s.Alpha;
            return o;
        }
        half4 LightingSkin(SurfaceOutputSkin s, half3 viewDir, UnityGI gi)
        {
            SurfaceOutputStandardSpecular p=StandardSkin(s);
            // A small part of direct diffuse light spreads through the dermis. The
            // specular lobe stays sharp enough to retain pores, never blurred like wax.
            p.Albedo*=1-_ScatterStrength*0.15;
            half4 color=LightingStandardSpecular(p,viewDir,gi);
            half nl=dot(normalize(s.Normal),gi.light.dir);
            half wrap=max(0,saturate((nl+0.35)/1.35)-saturate(nl));
            half back=saturate(-nl)*pow(saturate(dot(viewDir,-gi.light.dir)),3);
            half transmission=lerp(0.26,0.035,saturate(s.Thickness));
            // gi.light.color already includes distance and shadow attenuation:
            // no emission, screen-space glow or light leaking through buildings.
            color.rgb+=s.Albedo*_ScatterColor.rgb*gi.light.color*_ScatterStrength*
                (wrap*0.65+back*transmission)*s.Occlusion;
            return color;
        }
        void LightingSkin_GI(SurfaceOutputSkin s,UnityGIInput data,inout UnityGI gi)
        { LightingStandardSpecular_GI(StandardSkin(s),data,gi); }
        void surf(Input IN,inout SurfaceOutputSkin o)
        {
            half4 surface=tex2D(_SurfaceMap,IN.uv_MainTex);
            o.Albedo=tex2D(_MainTex,IN.uv_MainTex).rgb;
            o.Normal=UnpackScaleNormal(tex2D(_BumpMap,IN.uv_MainTex),_BumpScale);
            o.Specular=half3(0.028,0.028,0.028);
            o.Smoothness=clamp(surface.a,0.16,0.36);
            o.Occlusion=surface.g;
            o.Thickness=surface.b;
            o.Alpha=1;
        }
        ENDCG
    }
    FallBack "Standard"
}
