import { createBrowserRouter } from "react-router-dom";
import MainWrapper from "./components/MainWrapper";
import * as P from "./pages";
import { Amplify, Auth } from "aws-amplify";
import config from "./config";
import { QueryClient } from "@tanstack/react-query";

Amplify.configure({
  Auth: {
    mandatorySignIn: true,
    region: config.cognito.REGION,
    userPoolId: config.cognito.USER_POOL_ID,
    identityPoolId: config.cognito.IDENTITY_POOL_ID,
    userPoolWebClientId: config.cognito.APP_CLIENT_ID,
    oauth: {
      domain: config.cognito.APP_CLIENT_DOMAIN,
      redirectSignIn: config.cognito.REDIRECT_SIGNIN,
      redirectSignOut: config.cognito.REDIRECT_SIGNOUT,
      scope: ["email", "openid"],
      responseType: "code",
    },
  },
  API: {
    endpoints: [
      {
        name: "issues",
        endpoint: config.apiGateway.URL,
        region: config.apiGateway.REGION,
      },
    ],
  },
});

export const router = createBrowserRouter([
  {
    path: "/",
    element: <MainWrapper />,
    children: [
      { path: "/issues", element: <P.IssueList /> },
      { path: "/issues/:id", element: <P.ViewIssue /> },
      { path: "/medicaid", element: <P.Medicaid /> },
      { path: "/chip", element: <P.Chip /> },
      { path: "/waiver", element: <P.Waiver /> },
    ],
    loader: async () => {
      try {
        const queryClient = new QueryClient();
        queryClient.fetchQuery({
          queryFn: () => Auth.currentAuthenticatedUser(),
          queryKey: ["ben"],
        });
        return { isAuth: true };
      } catch (e) {
        if (e !== "No current user") {
          throw e;
        }
        return { isAuth: false };
      }
    },
  },
]);
