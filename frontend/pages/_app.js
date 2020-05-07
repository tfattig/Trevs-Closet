import App, { Container } from 'next/app';
import Page from '../components/Page';
import { ApolloProvider } from 'react-apollo';
import withData from '../lib/withData';

class MyApp extends App {
    //Specific to Next.JS will run before render()
    static async getInitialProps({ Component, ctx }) {
        let pageProps = {};
        if(Component.getInitialProps) {
            pageProps = await Component.getInitialProps(ctx);
        }
        //this exposes the query to the user
        pageProps.query = ctx.query;
        return { pageProps };
    }
    render() {
        const { Component, apollo, pageProps } = this.props;

        return (
            <container>
                <ApolloProvider client={apollo}>
                    <Page>
                        <Component {...pageProps} />
                    </Page>
                </ApolloProvider>
            </container>
        );
    }
}

export default withData(MyApp);