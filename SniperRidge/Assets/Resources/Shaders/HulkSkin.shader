Shader "SniperRidge/Hulk Skin"
{
 Properties
 {
  _Color ("Skin tone", Color) = (0.30,0.38,0.16,1)
  _MainTex ("Source skin", 2D) = "white" {}
  _BumpMap ("Skin normal", 2D) = "bump" {}
  _BumpScale ("Normal strength", Range(0,2)) = 0.65
  _Glossiness ("Skin smoothness", Range(0,1)) = 0.38
  _PoreStrength ("Pore relief", Range(0,1)) = 0.16
 }
 SubShader
 {
  Tags { "RenderType"="Opaque" }
  LOD 300
  CGPROGRAM
  #pragma surface surf StandardSpecular fullforwardshadows vertex:vert addshadow
  #pragma target 3.0
  #include "UnityStandardUtils.cginc"
  sampler2D _MainTex,_BumpMap;
  fixed4 _Color;
  half _BumpScale,_Glossiness,_PoreStrength;
  struct Input { float2 uv_MainTex; float3 rest; float4 color:COLOR; };
  void vert(inout appdata_full v,out Input o)
  {
   UNITY_INITIALIZE_OUTPUT(Input,o);
   // UV3 stores bind-pose coordinates, so pores stay attached during skinning.
   o.rest=v.texcoord2.xyz;o.color=v.color;
  }
  float hash3(float3 p){p=frac(p*.1031);p+=dot(p,p.yzx+33.33);return frac((p.x+p.y)*p.z);}
  float noise3(float3 p)
  {
   float3 i=floor(p),f=frac(p);f=f*f*(3-2*f);
   return lerp(lerp(lerp(hash3(i),hash3(i+float3(1,0,0)),f.x),lerp(hash3(i+float3(0,1,0)),hash3(i+float3(1,1,0)),f.x),f.y),
    lerp(lerp(hash3(i+float3(0,0,1)),hash3(i+float3(1,0,1)),f.x),lerp(hash3(i+float3(0,1,1)),hash3(i+1),f.x),f.y),f.z);
  }
  void surf(Input IN,inout SurfaceOutputStandardSpecular o)
  {
   float3 p=IN.rest;
   float broad=noise3(p*7.5),fine=noise3(p*43),pores=noise3(p*220);
   float variation=(broad-.5)*.34+(fine-.5)*.12;
   float3 skin=_Color.rgb*(1+variation);
   skin=lerp(skin,skin*float3(1.15,.95,.76),saturate((broad-.45)*.65));
   float arm=smoothstep(.49,.66,abs(p.x))*(1-smoothstep(1.82,2.1,p.y))*smoothstep(.98,1.2,p.y);
   float path=.73+.047*sin(p.y*12)+.023*sin(p.y*29);
   float vein=exp(-pow((abs(p.x)-path)/.008,2))*arm;
   skin*=1-vein*.12;
   float creases=pow(1-pores,7)*.13;
   o.Albedo=skin*tex2D(_MainTex,IN.uv_MainTex).rgb*(1-creases);
   half3 n=UnpackScaleNormal(tex2D(_BumpMap,IN.uv_MainTex),_BumpScale);
   float2 grain=float2(noise3(p*220+float3(19,3,7)),noise3(p*220+float3(5,31,2)))-.5;
   n.xy+=grain*_PoreStrength;
   o.Normal=normalize(n);
   o.Specular=half3(.035,.038,.029);
   o.Smoothness=clamp(_Glossiness+(fine-.5)*.13-creases,.22,.49);
   o.Occlusion=lerp(.36,1,saturate(IN.color.r));
   o.Alpha=1;
  }
  ENDCG
 }
 FallBack "Standard"
}
